"""
safe_writer.py — Motor de Escrita Segura para Frameworks Modernos (Etapa 3)

Garante que campos preenchidos em portais escolares modernos (React, Vue, Angular, Svelte)
não sejam perdidos devido a controlled inputs ou componentes customizados (div/ul/li).

Pilares:
1. Digitação Segura via press_sequentially + Native Value Descriptor Setter:
   React e Vue interceptam o setter de .value no elemento. Simples .fill() ou element.value = ...
   não aciona o _valueTracker interno do React. Usamos press_sequentially() gerando eventos
   nativos de teclado e reforçamos com o setter nativo de Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').
2. Detecção e Seleção em Dropdowns Customizados:
   Distingue automaticamente <select> nativo de componentes baseados em div/ul/li/button
   (role="combobox", role="listbox", .select-trigger, etc.), abrindo o menu, clicando na opção
   desejada e confirmando a seleção.
3. Checkpoint Imediato Pós-Escrita (Anti-Recorrência):
   Lê o DOM imediatamente após a interação e compara com o valor desejado.
   Se houver divergência, sinaliza drift antes de avançar qualquer etapa.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


# Helper JavaScript para destaque visual em tempo real (Estilo Comet/Perplexity)
HIGHLIGHT_JS_HELPER = r"""
(el, label) => {
    try {
        if (window.__teacherAiHighlight) {
            window.__teacherAiHighlight(el, label, 1500);
            return;
        }
        let box = document.getElementById('teacher-agent-focus-outline');
        if (!box) {
            box = document.createElement('div');
            box.id = 'teacher-agent-focus-outline';
            box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #38bdf8;background:rgba(56,189,248,0.08);box-shadow:0 0 16px rgba(56,189,248,0.45);border-radius:6px;transition:all 0.2s ease, opacity 0.3s ease;';
            const badge = document.createElement('div');
            badge.id = 'teacher-agent-focus-badge';
            badge.style.cssText = 'position:absolute;top:-24px;left:0;background:#0284c7;color:#fff;font-family:sans-serif;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
            box.appendChild(badge);
            document.body.appendChild(box);
        }
        const rect = el.getBoundingClientRect();
        box.style.top = Math.max(0, rect.top - 3) + 'px';
        box.style.left = Math.max(0, rect.left - 3) + 'px';
        box.style.width = (rect.width + 6) + 'px';
        box.style.height = (rect.height + 6) + 'px';
        box.style.opacity = '1';
        const b = box.querySelector('#teacher-agent-focus-badge');
        if (b) b.textContent = '🦉 Rafinha: ' + label;
        setTimeout(() => { if (box) box.style.opacity = '0'; }, 1500);
    } catch (e) {}
}
"""

# Script JavaScript executado no browser para controlled inputs do React/Vue/Angular
NATIVE_SETTER_AND_DISPATCH_JS = r"""
(element, value) => {
    if (!element) return { success: false, reason: 'element_null' };

    let setterFound = false;
    try {
        const proto = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                           (typeof HTMLInputElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')) ||
                           (typeof HTMLTextAreaElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')) ||
                           (typeof HTMLSelectElement !== 'undefined' && Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'));
        if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
            setterFound = true;
        }
    } catch (e) {}

    if (!setterFound) {
        element.value = value;
        if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
            element.innerText = value;
            element.textContent = value;
        }
    }

    try {
        element.focus();
    } catch (e) {}

    try {
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } catch (e) {}

    return {
        success: true,
        setterFound,
        currentValue: element.value !== undefined ? element.value : (element.innerText || '')
    };
}
"""


@dataclass
class WriteResult:
    success: bool
    expected_value: str
    actual_value: str
    verified: bool
    drift_detected: bool = False
    method_used: str = "press_sequentially"
    error_message: Optional[str] = None


@dataclass
class SelectResult:
    success: bool
    expected_value: str
    actual_value: str
    is_custom: bool
    verified: bool
    drift_detected: bool = False
    error_message: Optional[str] = None


@dataclass
class CheckboxResult:
    success: bool
    expected_checked: bool
    actual_checked: bool
    verified: bool
    drift_detected: bool = False
    error_message: Optional[str] = None


class SafeWriter:
    """
    Escritor seguro compatível com SPA / frameworks modernos (React, Vue, Angular).
    """

    def __init__(self, key_delay_ms: int = 15, timeout_ms: int = 5000):
        self.key_delay_ms = key_delay_ms
        self.timeout_ms = timeout_ms

    async def write_input(
        self,
        locator: Any,
        value: Union[str, int, float],
        clear_first: bool = True
    ) -> WriteResult:
        """
        Digita com segurança em input/textarea usando press_sequentially e reforço
        de setter nativo com eventos sintéticos e verificação imediata (checkpoint).
        """
        expected_str = str(value).strip()
        try:
            # 1. Foca o elemento e aciona destaque visual em tempo real (Estilo Comet/Perplexity)
            await locator.focus()
            try:
                if hasattr(locator, "evaluate"):
                    await locator.evaluate(HIGHLIGHT_JS_HELPER, "Preenchendo...")
            except Exception:
                pass

            # 2. Limpeza segura
            if clear_first:
                try:
                    await locator.fill("")
                except Exception:
                    # Fallback de seleção e deleção manual
                    await locator.press("Control+A")
                    await locator.press("Backspace")

            # 3. Digitação sequencial (gera keydown, keypress, keyup, input nativos)
            try:
                await locator.press_sequentially(expected_str, delay=self.key_delay_ms)
            except AttributeError:
                # Caso o locator mockado ou versão de playwright use type
                if hasattr(locator, "type"):
                    await locator.type(expected_str, delay=self.key_delay_ms)
                else:
                    await locator.fill(expected_str)

            # 4. Reforço para React/Vue Controlled Inputs via Native Property Descriptor Setter
            try:
                if hasattr(locator, "evaluate"):
                    await locator.evaluate(NATIVE_SETTER_AND_DISPATCH_JS, expected_str)
                await locator.dispatch_event("input")
                await locator.dispatch_event("change")
            except Exception:
                pass

            # 5. Blur para acionar onBlur / validação de formulário
            try:
                await locator.dispatch_event("blur")
            except Exception:
                pass

            # 6. CHECKPOINT IMEDIATO PÓS-ESCRITA
            actual_str = ""
            if hasattr(locator, "input_value"):
                actual_str = (await locator.input_value() or "").strip()
            elif hasattr(locator, "evaluate"):
                actual_str = (await locator.evaluate("el => el.value || el.innerText || ''") or "").strip()

            # Normalização de floats/números (ex: 8.0 vs 8 ou 8,0)
            matches = self._values_match(expected_str, actual_str)

            if not matches:
                return WriteResult(
                    success=False,
                    expected_value=expected_str,
                    actual_value=actual_str,
                    verified=False,
                    drift_detected=True,
                    method_used="press_sequentially+native_setter",
                    error_message=f"Divergência pós-escrita: esperado '{expected_str}', lido no DOM '{actual_str}'"
                )

            return WriteResult(
                success=True,
                expected_value=expected_str,
                actual_value=actual_str,
                verified=True,
                drift_detected=False,
                method_used="press_sequentially+native_setter"
            )

        except Exception as e:
            return WriteResult(
                success=False,
                expected_value=expected_str,
                actual_value="",
                verified=False,
                drift_detected=True,
                error_message=f"Falha ao executar escrita: {e}"
            )

    async def select_option(
        self,
        container_or_locator: Any,
        option_value_or_text: str,
        page: Optional[Any] = None
    ) -> SelectResult:
        """
        Detecta se o elemento é um <select> nativo ou dropdown customizado (div/ul/li, combobox),
        seleciona a opção e realiza o CHECKPOINT de verificação.
        """
        expected_str = option_value_or_text.strip()
        try:
            # 1. Verifica tag name do elemento
            tag_name = ""
            try:
                tag_name = (await container_or_locator.evaluate("el => el.tagName.toLowerCase()") or "").strip()
            except Exception:
                pass

            is_native_select = (tag_name == "select")

            # 2. Cenário A: <select> nativo
            if is_native_select:
                try:
                    try:
                        if hasattr(container_or_locator, "evaluate"):
                            await container_or_locator.evaluate(HIGHLIGHT_JS_HELPER, "Selecionando...")
                    except Exception:
                        pass
                    # Tenta selecionar por label ou por value
                    try:
                        await container_or_locator.select_option(label=expected_str)
                    except Exception:
                        await container_or_locator.select_option(value=expected_str)

                    await container_or_locator.dispatch_event("input")
                    await container_or_locator.dispatch_event("change")

                    # Checkpoint nativo
                    actual_val = await container_or_locator.input_value()
                    actual_text = ""
                    try:
                        actual_text = await container_or_locator.evaluate(
                            "el => el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : ''"
                        )
                    except Exception:
                        pass

                    matches = self._values_match(expected_str, actual_val) or self._values_match(expected_str, actual_text)
                    return SelectResult(
                        success=matches,
                        expected_value=expected_str,
                        actual_value=actual_text or actual_val,
                        is_custom=False,
                        verified=matches,
                        drift_detected=not matches
                    )
                except Exception as e:
                    return SelectResult(
                        success=False,
                        expected_value=expected_str,
                        actual_value="",
                        is_custom=False,
                        verified=False,
                        drift_detected=True,
                        error_message=f"Erro em select nativo: {e}"
                    )

            # 3. Cenário B: Componente customizado (div, button, role=combobox, role=listbox)
            # Destaque visual no menu dropdown
            try:
                if hasattr(container_or_locator, "evaluate"):
                    await container_or_locator.evaluate(HIGHLIGHT_JS_HELPER, "Selecionando...")
            except Exception:
                pass

            # Clica no trigger para abrir as opções
            await container_or_locator.click()
            await asyncio.sleep(0.15)  # Pequeno delay para animação de abertura

            # Contexto de busca das opções (pode estar na página ou dentro do container)
            search_context = page or container_or_locator

            # Procura a opção correspondente
            option_locator = None
            candidate_selectors = [
                f"[role='option']:has-text('{expected_str}')",
                f"li:has-text('{expected_str}')",
                f".dropdown-item:has-text('{expected_str}')",
                f"[class*='option']:has-text('{expected_str}')",
                f"div:has-text('{expected_str}')"
            ]

            for sel in candidate_selectors:
                try:
                    loc = search_context.locator(sel).first
                    if await loc.count() > 0 and await loc.is_visible():
                        option_locator = loc
                        break
                except Exception:
                    continue

            if not option_locator:
                # Fallback: get_by_text
                try:
                    loc = search_context.get_by_text(expected_str, exact=False).first
                    if await loc.count() > 0:
                        option_locator = loc
                except Exception:
                    pass

            if not option_locator:
                return SelectResult(
                    success=False,
                    expected_value=expected_str,
                    actual_value="",
                    is_custom=True,
                    verified=False,
                    drift_detected=True,
                    error_message=f"Opção customizada '{expected_str}' não encontrada após abrir dropdown."
                )

            # Clica na opção desejada
            await option_locator.click()
            await asyncio.sleep(0.1)

            # 4. CHECKPOINT IMEDIATO PÓS-SELEÇÃO EM CUSTOM DROPDOWN
            actual_text = ""
            try:
                actual_text = (await container_or_locator.inner_text() or "").strip()
            except Exception:
                try:
                    actual_text = (await container_or_locator.evaluate("el => el.innerText || el.textContent || ''") or "").strip()
                except Exception:
                    pass

            matches = self._values_match(expected_str, actual_text) or (expected_str.lower() in actual_text.lower())
            return SelectResult(
                success=matches,
                expected_value=expected_str,
                actual_value=actual_text,
                is_custom=True,
                verified=matches,
                drift_detected=not matches,
                error_message=None if matches else f"Checkpoint falhou: texto atual '{actual_text}' não reflete '{expected_str}'"
            )

        except Exception as e:
            return SelectResult(
                success=False,
                expected_value=expected_str,
                actual_value="",
                is_custom=True,
                verified=False,
                drift_detected=True,
                error_message=f"Falha em select customizado: {e}"
            )

    async def set_checkbox(
        self,
        locator: Any,
        checked: bool
    ) -> CheckboxResult:
        """
        Marca ou desmarca checkbox com eventos nativos e verificação de checkpoint.
        """
        try:
            # 1. Verifica estado atual
            current_checked = False
            if hasattr(locator, "is_checked"):
                current_checked = await locator.is_checked()
            else:
                current_checked = await locator.evaluate("el => !!el.checked || el.getAttribute('aria-checked') === 'true'")

            # Se já está no estado desejado
            if current_checked == checked:
                return CheckboxResult(
                    success=True,
                    expected_checked=checked,
                    actual_checked=current_checked,
                    verified=True,
                    drift_detected=False
                )

            # 2. Executa a alternância de estado com destaque visual
            try:
                if hasattr(locator, "evaluate"):
                    await locator.evaluate(HIGHLIGHT_JS_HELPER, "Marcando..." if checked else "Desmarcando...")
            except Exception:
                pass

            if hasattr(locator, "check") and hasattr(locator, "uncheck"):
                if checked:
                    await locator.check()
                else:
                    await locator.uncheck()
            else:
                await locator.click()

            # Dispara eventos
            try:
                await locator.dispatch_event("input")
                await locator.dispatch_event("change")
            except Exception:
                pass

            # 3. CHECKPOINT IMEDIATO PÓS-INTERAÇÃO
            new_checked = False
            if hasattr(locator, "is_checked"):
                new_checked = await locator.is_checked()
            else:
                new_checked = await locator.evaluate("el => !!el.checked || el.getAttribute('aria-checked') === 'true'")

            matches = (new_checked == checked)
            return CheckboxResult(
                success=matches,
                expected_checked=checked,
                actual_checked=new_checked,
                verified=matches,
                drift_detected=not matches,
                error_message=None if matches else f"Divergência checkbox: esperado checked={checked}, lido {new_checked}"
            )

        except Exception as e:
            return CheckboxResult(
                success=False,
                expected_checked=checked,
                actual_checked=False,
                verified=False,
                drift_detected=True,
                error_message=f"Erro ao alternar checkbox: {e}"
            )

    @staticmethod
    def _values_match(expected: str, actual: str) -> bool:
        """Compara strings tolerando vírgula/ponto e formatações numéricas (ex: 8.0 e 8,0 e 8)."""
        exp = expected.strip()
        act = actual.strip()
        if exp == act:
            return True
        if exp.lower() == act.lower():
            return True

        # Normalização decimal
        norm_exp = exp.replace(",", ".")
        norm_act = act.replace(",", ".")
        try:
            f_exp = float(norm_exp)
            f_act = float(norm_act)
            return abs(f_exp - f_act) < 1e-4
        except ValueError:
            pass

        return False

    async def read_current_value(self, locator: Any) -> str:
        """
        Lê o valor atual do DOM em tempo real diretamente do elemento no navegador.
        Fonte primária da verdade: o DOM vivo da página, nunca o cache do banco.
        """
        try:
            if hasattr(locator, "input_value"):
                return (await locator.input_value() or "").strip()
            elif hasattr(locator, "evaluate"):
                val = await locator.evaluate("el => el.value !== undefined ? el.value : (el.innerText || '')")
                return (str(val) if val is not None else "").strip()
        except Exception:
            pass
        return ""

    async def compute_and_write_relative_value(
        self,
        locator: Any,
        delta: float,
        expected_cached_base: Optional[float] = None
    ) -> Tuple[WriteResult, Dict[str, Any]]:
        """
        PRIORIDADE 2: Regra explícita para escrita relativa (ex: 'aumenta nota em +0.5'):
        1. SEMPRE relê o valor atual no DOM da página em tempo real.
        2. Detecta conflito se expected_cached_base for informado e diferir do DOM vivo.
        3. Calcula o novo valor baseado no DOM vivo (portal é a fonte da verdade).
        4. Executa a escrita segura com checkpoint imediato.
        """
        dom_val_str = await self.read_current_value(locator)
        clean_dom_str = dom_val_str.replace(",", ".").strip()
        try:
            current_dom_num = float(clean_dom_str) if clean_dom_str else 0.0
        except ValueError:
            current_dom_num = 0.0

        conflict_info: Dict[str, Any] = {
            "conflict_detected": False,
            "dom_value_at_write": current_dom_num,
            "cached_base": expected_cached_base,
            "warning": None
        }

        if expected_cached_base is not None:
            if abs(current_dom_num - expected_cached_base) > 1e-4:
                conflict_info["conflict_detected"] = True
                conflict_info["warning"] = (
                    f"Aviso de conflito externo: o banco em cache esperava base {expected_cached_base}, "
                    f"mas o portal real possui {current_dom_num}. "
                    f"A operação relativa foi aplicada sobre a fonte primária real ({current_dom_num} + {delta})."
                )

        new_val_num = current_dom_num + delta
        new_val_str = f"{new_val_num:.1f}" if new_val_num % 1 != 0 else str(int(new_val_num))

        write_res = await self.write_input(locator, new_val_str)
        return write_res, conflict_info
