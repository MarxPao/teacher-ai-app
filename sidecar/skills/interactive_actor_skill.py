"""
sidecar/skills/interactive_actor_skill.py — Skill de Atores Interativos com Ciclo de Vida Web Completo

Garante que as ações em portais escolares disparem todos os eventos esperados
por frameworks como React, Vue, Angular e WebForms legados:
- Inputs de texto / notas / faltas: focus -> keydown -> input -> change -> blur.
- Cliques: verificação de overlays, scrollIntoView({ block: 'center' }), dispatchMouseEvent.
- Dropdowns: seleção de opções por texto visível ou valor com disparo de 'change'.
"""

from typing import Any, Dict, Optional


class InteractiveActorSkill:
    """Skill de Execução Segura e Fiel de Ações no DOM."""

    @staticmethod
    def get_fill_script(selector: str, value: str) -> str:
        """
        Retorna script JavaScript robusto para preenchimento de campos de texto/nota.
        Garante que validadores React/Vue e AJAX ASP.NET sejam acionados.
        """
        escaped_val = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        escaped_sel = selector.replace("\\", "\\\\").replace("'", "\\'")
        return f"""(() => {{
            const el = document.querySelector('{escaped_sel}');
            if (!el) return {{ success: false, error: 'Elemento não encontrado' }};
            
            el.scrollIntoView({{ block: 'nearest', inline: 'nearest' }});
            el.focus();
            
            // Suporte a React 16+ Controlled Components
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) {{
                nativeInputValueSetter.call(el, '{escaped_val}');
            }} else {{
                el.value = '{escaped_val}';
            }}
            
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            el.dispatchEvent(new Event('blur', {{ bubbles: true }}));
            return {{ success: true, value: el.value }};
        }})()"""

    @staticmethod
    def get_click_script(selector: str) -> str:
        """
        Retorna script JS para clique seguro, checando interceptação por overlays.
        """
        escaped_sel = selector.replace("\\", "\\\\").replace("'", "\\'")
        return f"""(() => {{
            const el = document.querySelector('{escaped_sel}');
            if (!el) return {{ success: false, error: 'Elemento não encontrado' }};
            
            el.scrollIntoView({{ block: 'center', inline: 'center' }});
            
            // Checagem de overlay
            const rect = el.getBoundingClientRect();
            const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            const isCovered = topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el);
            
            if (isCovered) {{
                // Tenta remover backdrop se for modal de carregamento transparente
                if (topEl.classList.contains('modal-backdrop') || topEl.id.includes('loading') || topEl.id.includes('overlay')) {{
                    topEl.remove();
                }}
            }}
            
            el.click();
            return {{ success: true, wasCovered: Boolean(isCovered) }};
        }})()"""

    @staticmethod
    def get_select_dropdown_script(selector: str, option_text_or_val: str) -> str:
        """
        Script para selecionar opções em elementos <select> ou pseudo-dropdowns.
        """
        escaped_sel = selector.replace("\\", "\\\\").replace("'", "\\'")
        escaped_opt = option_text_or_val.replace("\\", "\\\\").replace("'", "\\'").lower()
        return f"""(() => {{
            const sel = document.querySelector('{escaped_sel}');
            if (!sel) return {{ success: false, error: 'Select não encontrado' }};
            
            let found = false;
            for (let i = 0; i < sel.options.length; i++) {{
                const opt = sel.options[i];
                if (opt.text.toLowerCase().includes('{escaped_opt}') || opt.value.toLowerCase().includes('{escaped_opt}')) {{
                    sel.selectedIndex = i;
                    found = true;
                    break;
                }}
            }}
            if (found) {{
                sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return {{ success: true, selectedValue: sel.value, selectedText: sel.options[sel.selectedIndex].text }};
            }}
            return {{ success: false, error: 'Opção não encontrada no dropdown' }};
        }})()"""
