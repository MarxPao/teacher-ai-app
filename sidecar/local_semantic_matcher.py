"""
local_semantic_matcher.py — Motor de Similaridade Semântica Vetorial Local (Fase 1)

Fornece matching semântico resiliente utilizando embeddings ONNX locais (fastembed),
eliminando a rigidez do vocabulário estático pré-definido e operando 100% desconectado
da nuvem após o download inicial do modelo.

LIMITAÇÃO ESTATÍSTICA CONHECIDA (Backlog TASK-SEMANTIC-REGISTRO-01):
O modelo 'paraphrase-multilingual-MiniLM-L12-v2' possui forte coocorrência estatística
da palavra 'registro' com termos de boletim/secretaria ('Notas'). Sem enriquecimento de
candidatos, 'registro de ausências' atinge maior similaridade com 'Notas' (0.6146) do que
com 'Frequência' (0.4195). A mitigação arquitetural em produção é a precedência estrita
da camada léxica (sinônimos explícitos no nó frequencia).
"""

from __future__ import annotations
import os
import sys
import time
from collections import OrderedDict
import logging
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional, Tuple

try:
    import numpy as np
except ImportError:
    np = None

try:
    from fastembed import TextEmbedding
except ImportError:
    TextEmbedding = None

logger = logging.getLogger("LocalSemanticMatcher")

DEFAULT_MULTILINGUAL_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_SIMILARITY_THRESHOLD = 0.50

# Glossário pedagógico de domínio para expansão semântica contextual
PEDAGOGICAL_DOMAIN_GLOSSES: Dict[str, str] = {
    "notas": "Notas (avaliações, pautas, notas parciais, boletim, conceitos, provas)",
    "frequência": "Frequência (chamada, presença, ausências, faltas, diário de frequência)",
    "frequencia": "Frequência (chamada, presença, ausências, faltas, diário de frequência)",
    "recados": "Recados (avisos, comunicados, mensagens, mural)",
    "horários": "Horários (quadro de horários, grade de aulas, horários de aula, turnos)",
    "horarios": "Horários (quadro de horários, grade de aulas, horários de aula, turnos)",
    "conteúdo": "Conteúdo (planejamento de aula, pauta de aula, registro de aula, matérias)",
    "conteudo": "Conteúdo (planejamento de aula, pauta de aula, registro de aula, matérias)",
}


class LocalSemanticMatcher:
    """
    Casca semântica vetorial local com suporte a inferência rápida em CPU,
    download em segundo plano e fallback automático para matching léxico.
    """
    _instance: Optional["LocalSemanticMatcher"] = None
    _lock = threading.Lock()

    def __init__(
        self,
        model_name: str = DEFAULT_MULTILINGUAL_MODEL,
        auto_preload: bool = False
    ):
        self.model_name = model_name
        self._model: Optional[Any] = None
        self._init_lock = threading.Lock()
        self._cache_lock = threading.Lock()
        self._vector_cache: OrderedDict[str, Any] = OrderedDict()
        self._cache_capacity: int = 512
        self.is_loading = False
        self.load_error: Optional[str] = None
        self.status = "idle"  # "idle" | "downloading" | "ready" | "error"
        self.last_load_time_ms: float = 0.0
        self.last_inference_time_ms: float = 0.0

        if auto_preload:
            self.start_background_preload()

    def _get_or_compute_embedding(self, model: Any, text: str) -> Any:
        """Recupera embedding do cache LRU ou calcula via modelo ONNX e armazena."""
        clean = text.strip()
        with self._cache_lock:
            if clean in self._vector_cache:
                self._vector_cache.move_to_end(clean)
                return self._vector_cache[clean]

        vec = list(model.embed([clean]))[0]
        with self._cache_lock:
            self._vector_cache[clean] = vec
            if len(self._vector_cache) > self._cache_capacity:
                self._vector_cache.popitem(last=False)
        return vec

    @classmethod
    def get_instance(cls) -> "LocalSemanticMatcher":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def get_cache_paths(self) -> List[Path]:
        """Retorna os possíveis diretórios de cache locais onde o modelo pode residir."""
        paths = []
        home_cache = Path.home() / ".cache" / "fastembed"
        paths.append(home_cache)
        temp_dir = os.environ.get("TEMP") or os.environ.get("TMP")
        if temp_dir:
            paths.append(Path(temp_dir) / "fastembed_cache")
        return paths

    def is_model_cached(self) -> bool:
        """Verifica se os arquivos do modelo já foram baixados para disco."""
        if getattr(self, "_cached_found", False):
            return True
        clean_name = self.model_name.replace("/", "--").replace("sentence-transformers--", "models--qdrant--")
        short_name = self.model_name.split("/")[-1].lower()
        for cache_root in self.get_cache_paths():
            if not cache_root.exists():
                continue
            for p in cache_root.rglob("*"):
                p_str = str(p).lower()
                if p.name.lower().endswith(".onnx") and (clean_name.lower() in p_str or short_name in p_str):
                    self._cached_found = True
                    return True
        return False

    def get_disk_size_mb(self) -> float:
        """Calcula o tamanho total em disco do modelo baixado."""
        cached_size = getattr(self, "_cached_disk_size", 0.0)
        if cached_size > 0:
            return cached_size
        clean_name = self.model_name.replace("/", "--").replace("sentence-transformers--", "models--qdrant--")
        short_name = self.model_name.split("/")[-1].lower()
        total_bytes = 0
        for cache_root in self.get_cache_paths():
            if not cache_root.exists():
                continue
            for f in cache_root.rglob("*"):
                f_str = str(f).lower()
                if f.is_file() and (clean_name.lower() in f_str or short_name in f_str):
                    if "snapshots" in f_str or "blobs" not in f_str:
                        total_bytes += f.stat().st_size
        val = round(total_bytes / (1024 * 1024), 2)
        if val > 0:
            self._cached_disk_size = val
        return val

    def start_background_preload(self):
        """Inicia o download e carregamento do modelo em thread desacoplada (não bloqueia UI/server)."""
        if self.status in ("ready", "downloading"):
            return

        def _bg_task():
            try:
                self.load_model()
            except Exception as e:
                logger.warning(f"[LocalSemanticMatcher] Falha no pré-carregamento em background: {e}")

        t = threading.Thread(target=_bg_task, daemon=True, name="SemanticMatcherPreload")
        t.start()

    def load_model(self) -> Any:
        """Carrega o modelo ONNX. Thread-safe."""
        if self._model is not None:
            return self._model

        with self._init_lock:
            if self._model is not None:
                return self._model

            if TextEmbedding is None:
                self.status = "error"
                self.load_error = "Pacote fastembed não está instalado."
                logger.warning(f"[LocalSemanticMatcher] {self.load_error}")
                return None

            t0 = time.perf_counter()
            self.is_loading = True
            is_cached = self.is_model_cached()
            self.status = "ready" if is_cached else "downloading"

            try:
                logger.info(f"[LocalSemanticMatcher] Inicializando modelo '{self.model_name}' (cached={is_cached})...")
                model_inst = TextEmbedding(model_name=self.model_name)
                self._model = model_inst
                self.status = "ready"
                self.load_error = None
                self.last_load_time_ms = (time.perf_counter() - t0) * 1000
                logger.info(f"[LocalSemanticMatcher] Modelo '{self.model_name}' pronto em {self.last_load_time_ms:.1f}ms.")
                return self._model
            except Exception as e:
                self.status = "error"
                self.load_error = str(e)
                logger.error(f"[EMBEDDING_FALLBACK_TRIGGERED] Falha crítica ao carregar modelo '{self.model_name}': {e}")
                return None
            finally:
                self.is_loading = False

    def match_best_candidate(
        self,
        query: str,
        candidates: List[str],
        candidate_meta: Optional[List[Dict[str, Any]]] = None,
        similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
        use_domain_gloss: bool = True
    ) -> Optional[Tuple[str, float, Optional[Dict[str, Any]]]]:
        """
        Calcula embeddings e similaridade de cosseno entre a query e candidatos.
        Retorna (melhor_candidato, similaridade, metadados) ou None se falhar/abaixo do limiar.
        Se use_domain_gloss=True, projeta glossários pedagógicos contextuais nos candidatos
        para eliminar viés de termos polissêmicos (ex: 'registro de ausências' -> 'Frequência').
        """
        if not query or not candidates or np is None:
            return None

        model = self.load_model()
        if model is None:
            # Item 2: Fallback visível caso o modelo falhe ao carregar
            logger.info(f"[EMBEDDING_FALLBACK_TRIGGERED] Modelo vetorial indisponível. Revertendo para matching léxico.")
            return None

        t0 = time.perf_counter()
        try:
            if use_domain_gloss:
                framed_candidates = [
                    PEDAGOGICAL_DOMAIN_GLOSSES.get(c.strip().lower(), c)
                    for c in candidates
                ]
            else:
                framed_candidates = candidates

            q_emb = self._get_or_compute_embedding(model, query)
            c_embs = [self._get_or_compute_embedding(model, fc) for fc in framed_candidates]
            self.last_inference_time_ms = (time.perf_counter() - t0) * 1000

            best_idx = -1
            best_sim = -1.0

            q_norm = np.linalg.norm(q_emb)
            if q_norm == 0:
                return None

            for idx, c_emb in enumerate(c_embs):
                c_norm = np.linalg.norm(c_emb)
                if c_norm == 0:
                    continue
                sim = float(np.dot(q_emb, c_emb) / (q_norm * c_norm))
                if sim > best_sim:
                    best_sim = sim
                    best_idx = idx

            if best_idx >= 0 and best_sim >= similarity_threshold:
                meta = candidate_meta[best_idx] if candidate_meta and len(candidate_meta) > best_idx else None
                return candidates[best_idx], round(best_sim, 4), meta

            return None
        except Exception as e:
            logger.warning(f"[EMBEDDING_FALLBACK_TRIGGERED] Exceção durante inferência vetorial: {e}. Revertendo para léxico.")
            return None

    def get_status_dict(self) -> Dict[str, Any]:
        """Retorna o estado do motor para a UI e endpoints HTTP."""
        with self._cache_lock:
            cache_size = len(self._vector_cache)
        return {
            "status": self.status,
            "model_name": self.model_name,
            "is_cached": self.is_model_cached(),
            "disk_size_mb": self.get_disk_size_mb(),
            "is_loading": self.is_loading,
            "cache_size": cache_size,
            "last_load_ms": round(self.last_load_time_ms, 2),
            "last_inference_ms": round(self.last_inference_time_ms, 2),
            "error": self.load_error
        }
