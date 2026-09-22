"""
portal_map_store.py — Camada de Acesso a Mapas de Portal Descobertos

Abstrai todo acesso a `discovered_portal_maps` no Supabase.
Em modo offline (supabase=None) opera em store em memória — útil para testes
e desenvolvimento local sem banco configurado.

Regra de subdomínio (anti-divergência white-label):
  Se validation_failures >= FAILURE_THRESHOLD, o próximo mapa é salvo com
  subdomínio completo (ex: machadosobrinho.paineldoaluno.com.br) em vez de
  domínio raiz (paineldoaluno.com.br), evitando que falhas de uma escola
  "contaminem" o mapa de outras escolas no mesmo produto.
"""

import json
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

# Threshold de falhas antes de cair para escopo de subdomínio
FAILURE_THRESHOLD = 3


@dataclass
class PortalSelectorMap:
    """Representação tipada de um mapa de seletores de portal."""
    portal_domain: str
    portal_display_name: Optional[str]
    discovered_selectors: Dict[str, Any]   # ver schema em migration SQL
    pagination_strategy: Optional[Dict[str, Any]]
    discovery_confidence: str              # 'high' | 'medium' | 'low'
    discovered_by_teacher_id: Optional[str]
    discovered_at: Optional[str] = None
    last_validated_at: Optional[str] = None
    validation_failures: int = 0
    superseded_by: Optional[str] = None
    id: Optional[str] = None


class PortalMapStore:
    """
    Camada de acesso a discovered_portal_maps.
    - Com supabase_client: persiste no banco.
    - Sem (supabase_client=None): opera em dicionário em memória (testes/offline).
    - Com storage_path: persiste em cache JSON local para sobrevivência entre execuções CLI.
    """

    def __init__(self, supabase_client: Any = None, storage_path: Optional[str] = None):
        self._sb = supabase_client
        self._storage_path = storage_path
        # Store em memória usado quando não há Supabase
        self._memory: Dict[str, PortalSelectorMap] = {}
        # Cache L1 em memória de alta performance com TTL (evita queries remotas redundantes ao Supabase)
        self._l1_cache: Dict[str, Tuple[float, Optional[PortalSelectorMap]]] = {}
        self._l1_cache_ttl: float = 300.0  # 5 minutos
        if self._storage_path and os.path.exists(self._storage_path):
            self._load_from_storage()

    def _invalidate_l1_cache(self, domain: str) -> None:
        """Invalida a entrada no cache L1 para o domínio e seu domínio raiz."""
        self._l1_cache.pop(domain, None)
        root = self._root_domain(domain)
        if root != domain:
            self._l1_cache.pop(root, None)

    def _load_from_storage(self) -> None:
        if not self._storage_path:
            return
        try:
            with open(self._storage_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                if isinstance(raw_data, dict):
                    for domain, map_dict in raw_data.items():
                        self._memory[domain] = PortalSelectorMap(**map_dict)
        except Exception as e:
            print(f"[MapStore] Aviso ao carregar cache local de mapas: {e}")

    def _save_to_storage(self) -> None:
        if not self._storage_path:
            return
        try:
            dir_name = os.path.dirname(os.path.abspath(self._storage_path))
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            serializable = {domain: asdict(m) for domain, m in self._memory.items()}
            with open(self._storage_path, "w", encoding="utf-8") as f:
                json.dump(serializable, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[MapStore] Aviso ao persistir cache local de mapas: {e}")

    # ------------------------------------------------------------------
    # Lookup — Camada 1
    # ------------------------------------------------------------------

    def lookup_map(self, domain: str) -> Optional[PortalSelectorMap]:
        """
        Busca o mapa ativo mais recente para `domain`.
        Retorna None se não encontrado (ou supersedido).
        Tenta lookup exato e, se falhar, lookup por domínio raiz.
        """
        # Lookup exato
        result = self._lookup_exact(domain)
        if result:
            return result

        # Fallback: domínio raiz (subdomain.root.com → root.com)
        root = self._root_domain(domain)
        if root != domain:
            return self._lookup_exact(root)

        return None

    def _lookup_exact(self, domain: str) -> Optional[PortalSelectorMap]:
        now = time.monotonic()
        if domain in self._l1_cache:
            ts, cached_map = self._l1_cache[domain]
            if now - ts < self._l1_cache_ttl:
                return cached_map

        result: Optional[PortalSelectorMap] = None
        if self._sb:
            try:
                res = (
                    self._sb.table("discovered_portal_maps")
                    .select("*")
                    .eq("portal_domain", domain)
                    .is_("superseded_by", "null")
                    .limit(1)
                    .execute()
                )
                if res.data:
                    result = self._row_to_map(res.data[0])
            except Exception as e:
                print(f"[MapStore] Aviso ao buscar mapa para '{domain}': {e}")
        else:
            m = self._memory.get(domain)
            if m and m.superseded_by is None:
                result = m

        self._l1_cache[domain] = (now, result)
        return result

    # ------------------------------------------------------------------
    # Salvar Mapa Descoberto
    # ------------------------------------------------------------------

    def save_map(
        self,
        domain: str,
        selectors: Dict[str, Any],
        display_name: Optional[str] = None,
        pagination: Optional[Dict[str, Any]] = None,
        confidence: str = "high",
        teacher_id: Optional[str] = None,
    ) -> str:
        """
        Persiste um novo mapa. Retorna o ID gerado.
        Não persiste se os dados essenciais (selectors) forem vazios.
        """
        if not selectors:
            raise ValueError("Não é possível salvar mapa sem seletores validados.")

        if confidence not in ("high", "medium", "low"):
            raise ValueError(f"Confiança inválida: {confidence}")

        # Guard de PII estrito antes de persistir mapa compartilhado
        import re
        FORBIDDEN_PII_PATTERNS = [
            re.compile(r"[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}"),
            re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
            re.compile(r"\(?\d{2}\)?\s?9?\d{4}-?\d{4}"),
            re.compile(r"(maria|joao|pedro|lucas|gabriel|ana|julia|bruno|carla|diego|eduarda|felipe)", re.IGNORECASE),
            re.compile(r"[0-9]{7,}"),
        ]
        selectors_str = str(selectors) + " " + str(pagination or "")
        for pat in FORBIDDEN_PII_PATTERNS:
            if pat.search(selectors_str):
                raise ValueError("Violação de segurança LGPD: PII detectada nos seletores ou estrutura do mapa.")

        row = {
            "portal_domain": domain,
            "portal_display_name": display_name,
            "discovered_selectors": selectors,
            "pagination_strategy": pagination,
            "discovery_confidence": confidence,
            "discovered_by_teacher_id": teacher_id,
            "last_validated_at": self._now_iso(),
            "validation_failures": 0,
        }

        self._invalidate_l1_cache(domain)

        if self._sb:
            try:
                res = self._sb.table("discovered_portal_maps").insert(row).execute()
                new_id = res.data[0]["id"]
                print(f"[MapStore] Mapa salvo para '{domain}' (id={new_id}, confiança={confidence}).")
                return new_id
            except Exception as e:
                print(f"[MapStore] Erro ao salvar mapa para '{domain}': {e}")
                return ""
        else:
            import uuid
            new_id = str(uuid.uuid4())
            m = PortalSelectorMap(
                id=new_id,
                portal_domain=domain,
                portal_display_name=display_name,
                discovered_selectors=selectors,
                pagination_strategy=pagination,
                discovery_confidence=confidence,
                discovered_by_teacher_id=teacher_id,
                discovered_at=self._now_iso(),
                last_validated_at=self._now_iso(),
                validation_failures=0,
            )
            self._memory[domain] = m
            self._save_to_storage()
            print(f"[MapStore] [MEM] Mapa salvo para '{domain}' (id={new_id}, confianca={confidence}).")
            return new_id

    # ------------------------------------------------------------------
    # Atualizar última validação bem-sucedida
    # ------------------------------------------------------------------

    def mark_validated(self, domain: str) -> None:
        """Atualiza last_validated_at quando o mapa funcionou com sucesso."""
        self._invalidate_l1_cache(domain)
        if self._sb:
            try:
                self._sb.table("discovered_portal_maps").update({
                    "last_validated_at": self._now_iso(),
                    "validation_failures": 0,
                }).eq("portal_domain", domain).is_("superseded_by", "null").execute()
            except Exception as e:
                print(f"[MapStore] Aviso ao marcar validação para '{domain}': {e}")
        else:
            m = self._memory.get(domain)
            if m:
                m.last_validated_at = self._now_iso()
                m.validation_failures = 0
                self._save_to_storage()

    # ------------------------------------------------------------------
    # Incrementar Falhas (Self-Healing)
    # ------------------------------------------------------------------

    def increment_failures(self, domain: str) -> int:
        """
        Incrementa validation_failures do mapa ativo.
        Retorna o novo total de falhas.
        """
        self._invalidate_l1_cache(domain)
        if self._sb:
            try:
                # Busca o atual
                res = (
                    self._sb.table("discovered_portal_maps")
                    .select("id, validation_failures")
                    .eq("portal_domain", domain)
                    .is_("superseded_by", "null")
                    .limit(1)
                    .execute()
                )
                if not res.data:
                    return 0
                row = res.data[0]
                new_count = (row.get("validation_failures") or 0) + 1
                self._sb.table("discovered_portal_maps").update({
                    "validation_failures": new_count
                }).eq("id", row["id"]).execute()
                print(f"[MapStore] Falhas para '{domain}': {new_count}.")
                return new_count
            except Exception as e:
                print(f"[MapStore] Erro ao incrementar falhas para '{domain}': {e}")
                return 0
        else:
            m = self._memory.get(domain)
            if m:
                m.validation_failures += 1
                self._save_to_storage()
                print(f"[MapStore] [MEM] Falhas para '{domain}': {m.validation_failures}.")
                return m.validation_failures
            return 0

    # ------------------------------------------------------------------
    # Gestão de Drift (Divergência Pós-Escrita)
    # ------------------------------------------------------------------

    def mark_drift(self, domain: str, action_type: Optional[str] = None, details: Optional[Dict[str, Any]] = None) -> None:
        """
        Marca que um mapa ou ação sofreu drift (ex: falha no read-back pós-escrita).
        Força o discovery_orchestrator a realizar nova descoberta na próxima execução.
        """
        if not hasattr(self, "_drift_flags"):
            self._drift_flags: Dict[str, Dict[str, Any]] = {}
        key = f"{domain}:{action_type or '*'}"
        self._drift_flags[key] = {
            "drifted_at": self._now_iso(),
            "details": details or {}
        }
        self.increment_failures(domain)
        print(f"[MapStore] ⚠️ Drift registrado para '{key}'. Redescoberta será exigida.")

    def is_drifted(self, domain: str, action_type: Optional[str] = None) -> bool:
        """Verifica se há sinalização ativa de drift para o domínio e ação."""
        if not hasattr(self, "_drift_flags"):
            self._drift_flags = {}
        key_specific = f"{domain}:{action_type or '*'}"
        key_global = f"{domain}:*"
        return key_specific in self._drift_flags or key_global in self._drift_flags

    def clear_drift(self, domain: str, action_type: Optional[str] = None) -> None:
        """Limpa a sinalização de drift após nova descoberta e validação."""
        if not hasattr(self, "_drift_flags"):
            self._drift_flags = {}
        key_specific = f"{domain}:{action_type or '*'}"
        key_global = f"{domain}:*"
        self._drift_flags.pop(key_specific, None)
        self._drift_flags.pop(key_global, None)
        print(f"[MapStore] ✅ Drift limpo para '{domain}' ({action_type or '*'}).")

    # ------------------------------------------------------------------
    # Auto-Cura de Seletores (Self-Healing)
    # ------------------------------------------------------------------

    def record_selector_failure(self, domain: str, action_key: str) -> int:
        """Contabiliza falha de um seletor específico e registra sinal de drift."""
        self.mark_drift(domain, action_type=action_key)
        m = self.lookup_map(domain)
        return m.validation_failures if m else 1

    def heal_selector(self, domain: str, action_key: str, new_selector_data: Dict[str, Any]) -> bool:
        """
        Auto-cura atômica de seletor degradado.
        Atualiza o seletor no mapa ativo, zera o contador de falhas e limpa a flag de drift.
        """
        self._invalidate_l1_cache(domain)
        if self._sb:
            try:
                map_obj = self.lookup_map(domain)
                if not map_obj:
                    return False
                selectors = map_obj.discovered_selectors.copy()
                selectors[action_key] = new_selector_data
                self._sb.table("discovered_portal_maps").update({
                    "discovered_selectors": selectors,
                    "validation_failures": 0,
                    "last_validated_at": self._now_iso(),
                }).eq("id", map_obj.id).execute()
                self.clear_drift(domain, action_type=action_key)
                print(f"[MapStore] 🩺 Auto-cura realizada para '{domain}:{action_key}'.")
                return True
            except Exception as e:
                print(f"[MapStore] Erro na auto-cura para '{domain}:{action_key}': {e}")
                return False
        else:
            m = self._memory.get(domain)
            if not m:
                # Se não existir mapa em memória, cria um novo
                self.save_map(
                    domain=domain,
                    selectors={action_key: new_selector_data},
                    confidence="high"
                )
                self.clear_drift(domain, action_type=action_key)
                return True

            m.discovered_selectors[action_key] = new_selector_data
            m.validation_failures = 0
            m.last_validated_at = self._now_iso()
            self.clear_drift(domain, action_type=action_key)
            self._save_to_storage()
            print(f"[MapStore] [MEM] 🩺 Auto-cura realizada para '{domain}:{action_key}'.")
            return True

    # ------------------------------------------------------------------
    # Encadear Mapa Obsoleto (superseded_by)
    # ------------------------------------------------------------------

    def supersede_map(self, old_domain: str, new_map_id: str) -> bool:
        """
        Marca o mapa antigo de `old_domain` como substituído por `new_map_id`.
        Retorna True se bem-sucedido.
        """
        if self._sb:
            try:
                self._sb.table("discovered_portal_maps").update({
                    "superseded_by": new_map_id
                }).eq("portal_domain", old_domain).is_("superseded_by", "null").execute()
                print(f"[MapStore] Mapa de '{old_domain}' marcado como substituido por {new_map_id}.")
                return True
            except Exception as e:
                print(f"[MapStore] Erro ao superseder mapa de '{old_domain}': {e}")
                return False
        else:
            m = self._memory.get(old_domain)
            if m:
                m.superseded_by = new_map_id
                self._save_to_storage()
                print(f"[MapStore] [MEM] Mapa de '{old_domain}' marcado como substituido por {new_map_id}.")
                return True
            return False

    # ------------------------------------------------------------------
    # Helpers de Domínio
    # ------------------------------------------------------------------

    @staticmethod
    def extract_domain(url: str) -> str:
        """Extrai o hostname de uma URL. Ex: https://x.paineldoaluno.com.br/foo → x.paineldoaluno.com.br"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.hostname or url
        except Exception:
            return url

    @staticmethod
    def _root_domain(domain: str) -> str:
        """
        Retorna o domínio raiz (registrável).
        Trata ccTLDs de 2 partes (ex: .com.br, .edu.br, .org.br, .net.br):
          machadosobrinho.paineldoaluno.com.br → paineldoaluno.com.br
          sub.escola.edu.br                   → escola.edu.br
          sub.escola.com                      → escola.com
        """
        # SLDs comuns que formam ccTLD de 2 partes
        COMMON_SLDS = {"com", "edu", "org", "net", "gov", "mil", "tur", "esp", "coop", "ind", "inf"}
        parts = domain.split(".")
        if len(parts) <= 2:
            return domain
        # Detecta ccTLD de 2 partes: ex .com.br → penúltima parte é SLD conhecido
        if len(parts) >= 3 and parts[-2] in COMMON_SLDS:
            # Mantém 3 partes: registrável.sld.tld
            return ".".join(parts[-3:])
        # Caso padrão: 2 partes (registrável.tld)
        return ".".join(parts[-2:])


    @staticmethod
    def should_use_subdomain_scope(failures: int) -> bool:
        """
        Se validation_failures >= FAILURE_THRESHOLD, o próximo mapa deve ser
        salvo por subdomínio completo, não por domínio raiz.
        Evita que falhas de layout de uma escola contaminem as demais.
        """
        return failures >= FAILURE_THRESHOLD

    # ------------------------------------------------------------------
    # Utilitários internos
    # ------------------------------------------------------------------

    @staticmethod
    def _now_iso() -> str:
        import datetime
        return datetime.datetime.utcnow().isoformat() + "Z"

    @staticmethod
    def _row_to_map(row: Dict[str, Any]) -> PortalSelectorMap:
        return PortalSelectorMap(
            id=row.get("id"),
            portal_domain=row.get("portal_domain", ""),
            portal_display_name=row.get("portal_display_name"),
            discovered_selectors=row.get("discovered_selectors", {}),
            pagination_strategy=row.get("pagination_strategy"),
            discovery_confidence=row.get("discovery_confidence", "low"),
            discovered_by_teacher_id=row.get("discovered_by_teacher_id"),
            discovered_at=row.get("discovered_at"),
            last_validated_at=row.get("last_validated_at"),
            validation_failures=row.get("validation_failures", 0),
            superseded_by=row.get("superseded_by"),
        )
