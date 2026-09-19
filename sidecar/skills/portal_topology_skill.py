"""
sidecar/skills/portal_topology_skill.py — Skill de Análise de Topologia & Arquitetura de Portais

Inspeciona e classifica o ambiente técnico da página ativa no navegador:
- Tipo de Renderização: SPA (React/Vue/Angular), SSR, Legado (ASP.NET WebForms __VIEWSTATE, PHP).
- Estrutura de Frames: Framesets, Iframes aninhados, Cross-Origin.
- Padrão de Tabelas: Tabela padrão com <th>, Tabela sem <th> (cabeçalho em rows[0]), CSS Grid, Cards.
- Componentes Dinâmicos: Select2, Flatpickr, PrimeNG, Bootstrap modals, Overlays de carregamento.
"""

import re
from typing import Any, Dict, List, Optional


class PortalTopologySkill:
    """Skill de Percepção Estrutural de Portais Educacionais."""

    @staticmethod
    def analyze_topology(page_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analisa um snapshot de dados da página (DOM, headers, scripts, url)
        e retorna o relatório topológico completo.
        """
        url = page_data.get("url", "")
        html_snippet = (page_data.get("raw_html") or page_data.get("body_preview") or "").lower()
        tables = page_data.get("tables") or []
        cards = page_data.get("cards") or []

        # 1. Arquitetura de Renderização
        architecture = "modern_web"
        if "__viewstate" in html_snippet or ".aspx" in url.lower():
            architecture = "aspnet_webforms_legacy"
        elif "react" in html_snippet or "ng-app" in html_snippet or "vue" in html_snippet:
            architecture = "single_page_app"
        elif ".php" in url.lower():
            architecture = "php_legacy_ssr"

        # 2. Padrão de Tabelas / Grades de Dados
        table_pattern = "none"
        has_th = False
        has_header_in_row0 = False

        if tables:
            for tbl in tables:
                headers = tbl.get("headers") or []
                rows = tbl.get("rows") or []
                if headers and any(str(h).strip() for h in headers):
                    has_th = True
                elif rows and len(rows) > 1:
                    # Verifica se a primeira linha tem cara de cabeçalho
                    first_row_text = " ".join(str(c) for c in rows[0]).lower()
                    if any(w in first_row_text for w in ["horário", "aluno", "dia", "feira", "turma", "nota"]):
                        has_header_in_row0 = True

            if has_th:
                table_pattern = "standard_table_with_th"
            elif has_header_in_row0:
                table_pattern = "legacy_table_no_th_header_in_rows"
            else:
                table_pattern = "data_table_generic"
        elif cards:
            table_pattern = "card_grid_based"

        # 3. Componentes Especiais & Widgets Detectados
        widgets = []
        if "select2" in html_snippet:
            widgets.append("select2_dropdown")
        if "flatpickr" in html_snippet or "datepicker" in html_snippet:
            widgets.append("datepicker")
        if "modal" in html_snippet or "dialog" in html_snippet:
            widgets.append("modal_dialog")
        if "overlay" in html_snippet or "loading" in html_snippet or "spinner" in html_snippet:
            widgets.append("loading_overlay")

        # 4. Detecção de Iframes
        has_iframes = bool(page_data.get("iframes_count", 0) > 0 or "<iframe" in html_snippet)

        return {
            "portal_url": url,
            "architecture": architecture,
            "table_pattern": table_pattern,
            "widgets_detected": widgets,
            "has_iframes": has_iframes,
            "total_tables": len(tables),
            "total_cards": len(cards),
            "is_legacy": architecture in ("aspnet_webforms_legacy", "php_legacy_ssr") or table_pattern == "legacy_table_no_th_header_in_rows",
            "recommended_strategy": PortalTopologySkill._recommend_strategy(architecture, table_pattern, widgets)
        }

    @staticmethod
    def _recommend_strategy(arch: str, tbl: str, widgets: List[str]) -> Dict[str, Any]:
        """Gera diretivas para o orquestrador com base na topologia."""
        directives = {
            "require_all_frames": True,
            "wait_after_select_ms": 500,
            "header_extraction_mode": "auto_promote_row0" if tbl == "legacy_table_no_th_header_in_rows" else "standard",
            "event_dispatch_mode": "full_lifecycle",  # focus + input + change + blur
            "avoid_overlays": "loading_overlay" in widgets
        }
        if arch == "aspnet_webforms_legacy":
            directives["wait_after_select_ms"] = 1200  # PostBack do ASP.NET
        return directives
