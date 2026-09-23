"""
sidecar/supabase_memory_client.py — Cliente de Memória Local-First para Pathways e Auto-Desenvolvimento

Gerencia a persistência e consulta de:
1. portal_pathways & portal_pathway_steps (Caminhos de Navegação Compilados e Confiança)
2. portal_episodes_log (Histórico de Execuções e Acertos/Erros)
3. portal_anti_patterns (Memória Negativa de Comportamentos a Evitar)

Possui resiliência Local-First com cache em disco em sidecar/skills/cache/
caso a rede ou o Supabase estejam offline.
"""

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("SupabaseMemoryClient")

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "skills" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

PATHWAYS_CACHE_FILE = CACHE_DIR / "pathways_cache.json"
ANTI_PATTERNS_CACHE_FILE = CACHE_DIR / "anti_patterns_cache.json"
EPISODES_CACHE_FILE = CACHE_DIR / "episodes_cache.json"


def _load_env():
    """Carrega variáveis do sidecar/.env ou .env.local se disponíveis."""
    for env_path in [BASE_DIR / ".env", BASE_DIR.parent / ".env.local"]:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k, v = k.strip(), v.strip().strip("'\"")
                            if k and k not in os.environ:
                                os.environ[k] = v
            except Exception as e:
                logger.warning(f"Erro ao carregar {env_path}: {e}")


_load_env()


class SupabaseMemoryClient:
    """Cliente de Memória Híbrido (Supabase Cloud + Local-First Fallback)."""

    def __init__(self):
        self.supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        self.rest_endpoint = f"{self.supabase_url}/rest/v1" if self.supabase_url else ""
        self._init_local_caches()

    def _init_local_caches(self):
        """Inicializa caches locais em disco caso não existam."""
        if not PATHWAYS_CACHE_FILE.exists():
            with open(PATHWAYS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f)
        if not ANTI_PATTERNS_CACHE_FILE.exists():
            with open(ANTI_PATTERNS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump([], f)
        if not EPISODES_CACHE_FILE.exists():
            with open(EPISODES_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump([], f)

    def _headers(self) -> Dict[str, str]:
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    # ── 1. GESTÃO DE PATHWAYS ────────────────────────────────────────────────

    def get_best_pathway(self, portal_id: str, intent: str) -> Optional[Dict[str, Any]]:
        """
        Busca o melhor caminho compilado para o portal e objetivo solicitado.
        Retorna o pathway com maior confiança e seus passos ordenados.
        """
        # 1. Tenta consulta ao Supabase via REST
        if self.supabase_url and self.supabase_key:
            try:
                import requests
                url = f"{self.rest_endpoint}/portal_pathways?portal_id=eq.{portal_id}&intent=eq.{intent}&status=neq.deprecated&order=confidence_score.desc&limit=1"
                resp = requests.get(url, headers=self._headers(), timeout=3.0)
                if resp.status_code == 200:
                    rows = resp.json()
                    if rows:
                        pw = rows[0]
                        steps_url = f"{self.rest_endpoint}/portal_pathway_steps?pathway_id=eq.{pw['id']}&order=step_order.asc"
                        steps_resp = requests.get(steps_url, headers=self._headers(), timeout=3.0)
                        if steps_resp.status_code == 200:
                            pw["steps"] = steps_resp.json()
                        else:
                            pw["steps"] = []
                        self._save_pathway_to_local_cache(pw)
                        return pw
            except Exception as e:
                logger.warning(f"Falha ao consultar Supabase para pathway ({portal_id}/{intent}): {e}")

        # 2. Fallback Local-First
        return self._get_best_pathway_local(portal_id, intent)

    def _get_best_pathway_local(self, portal_id: str, intent: str) -> Optional[Dict[str, Any]]:
        try:
            with open(PATHWAYS_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
            candidates = [
                pw for pw in cache.values()
                if pw.get("portal_id") == portal_id and pw.get("intent") == intent and pw.get("status") != "deprecated"
            ]
            if candidates:
                candidates.sort(key=lambda x: x.get("confidence_score", 0.0), reverse=True)
                return candidates[0]
        except Exception as e:
            logger.error(f"Erro ao ler cache local de pathways: {e}")
        return None

    def save_compiled_pathway(self, pathway_data: Dict[str, Any], steps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Salva ou atualiza um caminho compilado e seus passos no Supabase e no cache local."""
        pw_id = pathway_data.get("id") or f"path_{pathway_data.get('portal_id')}_{pathway_data.get('intent')}_v{int(time.time())}"
        pathway_data["id"] = pw_id
        pathway_data["steps"] = steps

        # 1. Salva no cache local imediatamente
        self._save_pathway_to_local_cache(pathway_data)

        # 2. Tenta sincronizar com o Supabase
        if self.supabase_url and self.supabase_key:
            try:
                import requests
                pw_payload = {k: v for k, v in pathway_data.items() if k != "steps"}
                headers = {**self._headers(), "Prefer": "resolution=merge-duplicates,return=representation"}
                resp = requests.post(f"{self.rest_endpoint}/portal_pathways", json=pw_payload, headers=headers, timeout=4.0)

                # Salva os passos
                if steps:
                    for i, step in enumerate(steps, 1):
                        step["pathway_id"] = pw_id
                        step["step_order"] = step.get("step_order", i)
                        if not step.get("id"):
                            step["id"] = f"{pw_id}_s{i}"
                    requests.post(f"{self.rest_endpoint}/portal_pathway_steps", json=steps, headers=headers, timeout=4.0)

                logger.info(f"✅ Pathway compilado sincronizado com o Supabase: {pw_id}")
            except Exception as e:
                logger.warning(f"Aviso: Não foi possível sincronizar pathway com o Supabase (salvo localmente): {e}")

        return pathway_data

    def _save_pathway_to_local_cache(self, pathway_data: Dict[str, Any]):
        try:
            with open(PATHWAYS_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
            cache[pathway_data["id"]] = pathway_data
            with open(PATHWAYS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erro ao salvar pathway em cache local: {e}")

    # ── 2. MEMÓRIA EPISÓDICA (ACERTOS, ERROS & REFORÇO) ──────────────────────

    def record_episode(self, episode_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Registra uma execução na memória episódica e atualiza a pontuação
        de confiança (Q-score) do pathway associado.
        """
        ep_id = episode_data.get("id") or f"ep_{int(time.time())}_{os.urandom(3).hex()}"
        episode_data["id"] = ep_id
        outcome = episode_data.get("outcome", "SUCCESS")
        pathway_id = episode_data.get("pathway_id")

        # 1. Atualiza pontuação do Pathway se houver ID
        if pathway_id:
            self._update_pathway_confidence(pathway_id, is_success=(outcome == "SUCCESS"))

        # 2. Salva no cache local de episódios
        try:
            with open(EPISODES_CACHE_FILE, "r", encoding="utf-8") as f:
                episodes = json.load(f)
            episodes.append(episode_data)
            # Mantém apenas os últimos 500 episódios no cache local
            if len(episodes) > 500:
                episodes = episodes[-500:]
            with open(EPISODES_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(episodes, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erro ao salvar episódio localmente: {e}")

        # 3. Tenta persistir no Supabase
        if self.supabase_url and self.supabase_key:
            try:
                import requests
                requests.post(f"{self.rest_endpoint}/portal_episodes_log", json=episode_data, headers=self._headers(), timeout=3.0)
            except Exception as e:
                logger.warning(f"Aviso: Não foi possível salvar episódio no Supabase (salvo localmente): {e}")
                try:
                    from offline_sync_queue import offline_sync_queue
                    offline_sync_queue.enqueue("EPISODE", episode_data)
                except Exception:
                    pass

        return episode_data

    def _update_pathway_confidence(self, pathway_id: str, is_success: bool):
        """Atualização Bayesiana/Reforço do Q-Score da rota."""
        alpha = 0.15  # Taxa de aprendizado
        reward = 1.0 if is_success else 0.0

        # Atualiza no cache local
        try:
            with open(PATHWAYS_CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
            if pathway_id in cache:
                pw = cache[pathway_id]
                old_q = float(pw.get("confidence_score", 0.9))
                new_q = round(old_q + alpha * (reward - old_q), 2)
                pw["confidence_score"] = new_q
                pw["total_runs"] = pw.get("total_runs", 0) + 1
                if is_success:
                    pw["successful_runs"] = pw.get("successful_runs", 0) + 1
                else:
                    pw["failed_runs"] = pw.get("failed_runs", 0) + 1

                if new_q < 0.45:
                    pw["status"] = "deprecated"
                    logger.warning(f"⚠️ Pathway {pathway_id} depreciado por baixa confiança ({new_q})")

                with open(PATHWAYS_CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump(cache, f, indent=2, ensure_ascii=False)

                # Tenta atualizar no Supabase
                if self.supabase_url and self.supabase_key:
                    try:
                        import requests
                        payload = {
                            "confidence_score": new_q,
                            "total_runs": pw["total_runs"],
                            "successful_runs": pw.get("successful_runs", 0),
                            "failed_runs": pw.get("failed_runs", 0),
                            "status": pw["status"]
                        }
                        requests.patch(f"{self.rest_endpoint}/portal_pathways?id=eq.{pathway_id}", json=payload, headers=self._headers(), timeout=3.0)
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Erro ao atualizar confiança do pathway: {e}")

    # ── 3. MEMÓRIA NEGATIVA (ANTI-PADRÕES) ────────────────────────────────────

    def get_anti_patterns(self, portal_id: str, intent: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna lista de anti-padrões e armadilhas a serem evitadas no portal."""
        # 1. Supabase Cloud
        if self.supabase_url and self.supabase_key:
            try:
                import requests
                url = f"{self.rest_endpoint}/portal_anti_patterns?portal_id=eq.{portal_id}"
                if intent:
                    url += f"&or=(intent.eq.{intent},intent.is.null)"
                resp = requests.get(url, headers=self._headers(), timeout=3.0)
                if resp.status_code == 200:
                    rows = resp.json()
                    self._update_anti_patterns_local_cache(rows)
                    return rows
            except Exception as e:
                logger.warning(f"Falha ao buscar anti-padrões no Supabase: {e}")

        # 2. Local-First Fallback
        try:
            with open(ANTI_PATTERNS_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            return [
                a for a in cached
                if a.get("portal_id") == portal_id and (not intent or a.get("intent") in (intent, None))
            ]
        except Exception as e:
            logger.error(f"Erro ao ler cache de anti-padrões: {e}")
            return []

    def record_anti_pattern(
        self,
        portal_id: str,
        avoid_action: Dict[str, Any],
        reason: str,
        intent: Optional[str] = None,
        screen_signature: Optional[str] = None,
        recommended_alternative: Optional[str] = None
    ) -> Dict[str, Any]:
        """Registra uma nova regra na biblioteca de anti-padrões do portal."""
        anti_id = f"anti_{portal_id}_{os.urandom(3).hex()}"
        item = {
            "id": anti_id,
            "portal_id": portal_id,
            "intent": intent,
            "screen_signature": screen_signature,
            "avoid_action": avoid_action,
            "reason": reason,
            "recommended_alternative": recommended_alternative,
            "occurrence_count": 1,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        # Salva localmente
        try:
            with open(ANTI_PATTERNS_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached.append(item)
            with open(ANTI_PATTERNS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cached, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erro ao gravar anti-padrão localmente: {e}")

        # Salva no Supabase
        if self.supabase_url and self.supabase_key:
            try:
                import requests
                requests.post(f"{self.rest_endpoint}/portal_anti_patterns", json=item, headers=self._headers(), timeout=3.0)
            except Exception as e:
                logger.warning(f"Aviso: Não foi possível salvar anti-padrão no Supabase: {e}")
                try:
                    from offline_sync_queue import offline_sync_queue
                    offline_sync_queue.enqueue("ANTI_PATTERN", item)
                except Exception:
                    pass

        return item

    def _update_anti_patterns_local_cache(self, items: List[Dict[str, Any]]):
        try:
            with open(ANTI_PATTERNS_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached_ids = {c.get("id") for c in cached}
            for it in items:
                if it.get("id") not in cached_ids:
                    cached.append(it)
            with open(ANTI_PATTERNS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cached, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Erro ao atualizar cache local de anti-padrões: {e}")


# Instância Singleton
supabase_memory = SupabaseMemoryClient()
