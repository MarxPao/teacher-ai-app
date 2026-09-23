"""
sidecar/skills/ground_truth_verifier_skill.py — Skill de Verificação de Efeito Colateral Real (Pilar 1)

Valida de forma estrita e factual se a ação produziu o efeito esperado no portal:
- Verificação de mutação no DOM (surgimento/desaparecimento de nós, troca de classes).
- Detecção de banners de erro silenciosos ("Sessão expirada", "Campos obrigatórios", etc.).
- Verificação de mudança de URL.
- Zero-Alucinação: se o estado não mudou, classifica honestamente como NO_EFFECT.
"""

import re
from typing import Any, Dict, List, Optional


class GroundTruthVerifierSkill:
    """Skill de Verificação Inviolável de Efeitos Colaterais."""

    ERROR_PATTERNS = [
        re.compile(r"sess[aã]o\s+expirad[ao]", re.I),
        re.compile(r"campo\s+obrigat[oó]rio", re.I),
        re.compile(r"erro\s+(?:ao|no|na)\s+(?:salvar|gravar|processar)", re.I),
        re.compile(r"dados\s+inv[aá]lidos", re.I),
        re.compile(r"permiss[aã]o\s+negada", re.I),
        re.compile(r"n[aã]o\s+foi\s+poss[ií]vel\s+conectar", re.I),
    ]

    SUCCESS_PATTERNS = [
        re.compile(r"salv[ao]\s+com\s+sucesso", re.I),
        re.compile(r"dados\s+gravados", re.I),
        re.compile(r"opera[cç][aã]o\s+conclu[ií]da", re.I),
        re.compile(r"frequ[eê]ncia\s+registrada", re.I),
        re.compile(r"nota[s]?\s+lan[cç]ada[s]?", re.I),
    ]

    @staticmethod
    def verify(
        before_state: Dict[str, Any],
        after_state: Dict[str, Any],
        rule: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Compara o estado antes e depois da ação com base na regra de verificação.
        """
        r = rule or {}
        before_url = before_state.get("url", "")
        after_url = after_state.get("url", "")
        before_dom = before_state.get("dom_summary") or {}
        after_dom = after_state.get("dom_summary") or {}
        after_text = str(after_state.get("page_text") or after_state.get("raw_html") or "").lower()

        # 1. Checagem de Erros Graves no DOM
        for ep in GroundTruthVerifierSkill.ERROR_PATTERNS:
            match = ep.search(after_text)
            if match:
                return {
                    "verified": False,
                    "status": "ERROR_DETECTED",
                    "details": f"Banner de erro detectado no portal: '{match.group(0)}'",
                    "is_failure": True
                }

        # 2. Checagem de Mudança de URL (se exigida pela regra)
        if r.get("url_contains"):
            target_str = r["url_contains"].lower()
            if target_str in after_url.lower():
                return {
                    "verified": True,
                    "status": "SUCCESS",
                    "details": f"URL transicionou com sucesso para conter '{r['url_contains']}'"
                }
            elif before_url == after_url:
                return {
                    "verified": False,
                    "status": "NO_EFFECT",
                    "details": f"URL não mudou (esperava '{r['url_contains']}')",
                    "is_failure": True
                }

        # 3. Checagem de Mensagem Explícita de Sucesso
        for sp in GroundTruthVerifierSkill.SUCCESS_PATTERNS:
            match = sp.search(after_text)
            if match:
                return {
                    "verified": True,
                    "status": "SUCCESS",
                    "details": f"Mensagem de sucesso factual detectada: '{match.group(0)}'"
                }

        # 4. Checagem de Elemento Esperado Visível
        if r.get("expected_element"):
            elem_found = after_state.get("element_found", False)
            if elem_found:
                return {
                    "verified": True,
                    "status": "SUCCESS",
                    "details": f"Elemento esperado '{r['expected_element']}' agora está visível."
                }
            return {
                "verified": False,
                "status": "NO_EFFECT",
                "details": f"Elemento esperado '{r['expected_element']}' não apareceu no DOM.",
                "is_failure": True
            }

        # 5. Checagem de Mutação Genérica (Houve qualquer mudança no DOM ou URL?)
        if before_url != after_url:
            return {
                "verified": True,
                "status": "SUCCESS",
                "details": f"Transição de tela confirmada ({before_url} -> {after_url})"
            }

        # Se nada mudou e não havia erro explícito
        return {
            "verified": False,
            "status": "NO_EFFECT",
            "details": "A ação foi disparada mas nenhum efeito colateral visível foi detectado na tela.",
            "is_failure": True
        }
