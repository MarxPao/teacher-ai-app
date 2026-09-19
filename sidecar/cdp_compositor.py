"""
sidecar/cdp_compositor.py — Despachante Nativo no Nível do Compositor do Navegador (CDP Native Compositor)

Executa ações de mouse e teclado diretamente no nível gráfico do Chromium,
bypasando limitações de componentes controlados do React 18/19, proxies do Vue 3,
Signals do Angular, Shadow DOM fechado e formulários legados ASP.NET WebForms.
"""

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger("CDPCompositor")


class CDPCompositor:
    """Despacha eventos de entrada nativos no nível do sistema operacional / compositor."""

    @staticmethod
    def calculate_centroid(box_content: List[float]) -> Tuple[float, float]:
        """
        Calcula o centróide exato (x, y) de um polígono de 8 coordenadas retornado por DOM.getBoxModel.
        Estrutura do content: [x1, y1, x2, y2, x3, y3, x4, y4]
        """
        if not box_content or len(box_content) < 8:
            raise ValueError("box_content deve conter pelo menos 8 coordenadas numéricas")
        
        xs = box_content[0::2]
        ys = box_content[1::2]
        center_x = round(sum(xs) / len(xs), 2)
        center_y = round(sum(ys) / len(ys), 2)
        return center_x, center_y

    @staticmethod
    def generate_mouse_click_sequence(
        x: float,
        y: float,
        button: str = "left",
        click_count: int = 1
    ) -> List[Dict[str, Any]]:
        """
        Gera a sequência canônica de eventos físicos de mouse para Input.dispatchMouseEvent.
        1. mouseMoved (posiciona o cursor no centróide do elemento)
        2. mousePressed (botão pressionado físico)
        3. mouseReleased (botão solto físico)
        """
        buttons_mask = 1 if button == "left" else (2 if button == "right" else 4)

        return [
            {
                "method": "Input.dispatchMouseEvent",
                "params": {
                    "type": "mouseMoved",
                    "x": x,
                    "y": y,
                    "pointerType": "mouse"
                }
            },
            {
                "method": "Input.dispatchMouseEvent",
                "params": {
                    "type": "mousePressed",
                    "x": x,
                    "y": y,
                    "button": button,
                    "buttons": buttons_mask,
                    "clickCount": click_count,
                    "pointerType": "mouse"
                }
            },
            {
                "method": "Input.dispatchMouseEvent",
                "params": {
                    "type": "mouseReleased",
                    "x": x,
                    "y": y,
                    "button": button,
                    "buttons": 0,
                    "clickCount": click_count,
                    "pointerType": "mouse"
                }
            }
        ]

    @staticmethod
    def generate_type_sequence(text: str, clear_before: bool = True) -> List[Dict[str, Any]]:
        """
        Gera sequência de teclas físicas para Input.dispatchKeyEvent.
        Se clear_before=True, dispara Ctrl+A (ou Cmd+A) seguido de Backspace com scan-codes Win32 reais.
        """
        commands = []

        if clear_before:
            # 1. Ctrl + A (seleciona todo o conteúdo existente)
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "rawKeyDown",
                    "modifiers": 2,  # Ctrl modifier
                    "windowsVirtualKeyCode": 65,  # KeyA
                    "code": "KeyA",
                    "key": "a"
                }
            })
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "keyUp",
                    "modifiers": 2,
                    "windowsVirtualKeyCode": 65,
                    "code": "KeyA",
                    "key": "a"
                }
            })

            # 2. Backspace (apaga seleção)
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "rawKeyDown",
                    "windowsVirtualKeyCode": 8,  # Backspace
                    "code": "Backspace",
                    "key": "Backspace"
                }
            })
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "keyUp",
                    "windowsVirtualKeyCode": 8,
                    "code": "Backspace",
                    "key": "Backspace"
                }
            })

        # 3. Digitação caractere a caractere com eventos físicos
        for char in text:
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "keyDown",
                    "text": char,
                    "unmodifiedText": char,
                    "key": char
                }
            })
            commands.append({
                "method": "Input.dispatchKeyEvent",
                "params": {
                    "type": "keyUp",
                    "key": char
                }
            })

        return commands

    async def execute_native_click(
        self,
        cdp_sender: Callable[[str, Dict[str, Any]], Any],
        x: float,
        y: float
    ) -> Dict[str, Any]:
        """Dispara sequência nativa de clique através de um canal CDP (WebSocket ou chrome.debugger)."""
        sequence = self.generate_mouse_click_sequence(x, y)
        for cmd in sequence:
            await cdp_sender(cmd["method"], cmd["params"])
            await asyncio.sleep(0.02)  # 20ms de latência mecânica realista
        
        logger.info(f"🖱️ [CDPCompositor] Clique nativo executado no centróide ({x}, {y})")
        return {"success": True, "centroid": [x, y], "events_count": len(sequence)}

    async def execute_native_typing(
        self,
        cdp_sender: Callable[[str, Dict[str, Any]], Any],
        text: str,
        clear_before: bool = True
    ) -> Dict[str, Any]:
        """Dispara sequência de digitação nativa no elemento ativo com foco."""
        sequence = self.generate_type_sequence(text, clear_before=clear_before)
        for cmd in sequence:
            await cdp_sender(cmd["method"], cmd["params"])
            await asyncio.sleep(0.01)  # 10ms por evento
        
        logger.info(f"⌨️ [CDPCompositor] Digitação nativa concluída ({len(text)} caracteres)")
        return {"success": True, "characters_typed": len(text), "events_count": len(sequence)}


cdp_compositor = CDPCompositor()
