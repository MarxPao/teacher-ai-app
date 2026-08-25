"""
tray_app.py — Ícone de Bandeja do Sistema (System Tray) para o Sidecar Desktop
Exibe status em tempo real (Ocioso / Executando Tarefa / Aguardando Aprovação).
"""

import threading
from typing import Callable, Optional
from PIL import Image, ImageDraw

class TrayApp:
    def __init__(self, on_exit: Optional[Callable] = None, on_reconnect_cdp: Optional[Callable] = None):
        self.on_exit = on_exit
        self.on_reconnect_cdp = on_reconnect_cdp
        self.icon = None
        self.status = "idle"
        self.status_text = "Ocioso"

    def _create_icon_image(self, color: str = "#8b5e3c") -> Image.Image:
        """Gera uma imagem de ícone estilizada em memória com a paleta do Teacher AI."""
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Fundo arredondado
        draw.ellipse([4, 4, 60, 60], fill=color, outline="#ffffff", width=2)

        # Detalhe visual de olhos de coruja / sabedoria
        draw.ellipse([18, 22, 28, 32], fill="#ffffff")
        draw.ellipse([36, 22, 46, 32], fill="#ffffff")
        draw.ellipse([21, 25, 25, 29], fill="#1c0e06")
        draw.ellipse([39, 25, 43, 29], fill="#1c0e06")
        draw.polygon([(32, 34), (28, 42), (36, 42)], fill="#f0c89e")

        return img

    def update_status(self, status: str, text: str):
        """Atualiza a cor do ícone e o texto de dica na bandeja."""
        self.status = status
        self.status_text = text

        colors = {
            "idle": "#16a34a",     # Verde
            "running": "#d97706",  # Âmbar / Laranja
            "waiting": "#2563eb",  # Azul
            "error": "#dc2626"     # Vermelho
        }
        color = colors.get(status, "#8b5e3c")

        if self.icon:
            self.icon.icon = self._create_icon_image(color)
            self.icon.title = f"Teacher AI Sidecar — {text}"

    def run(self):
        """Inicia o ícone de bandeja."""
        try:
            import pystray

            menu = pystray.Menu(
                pystray.MenuItem(lambda text: f"Status: {self.status_text}", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Reconectar Chrome CDP (9222)", lambda: self.on_reconnect_cdp() if self.on_reconnect_cdp else None),
                pystray.MenuItem("Sair do Sidecar", lambda: self.on_exit() if self.on_exit else None)
            )

            self.icon = pystray.Icon(
                "TeacherAISidecar",
                self._create_icon_image("#16a34a"),
                "Teacher AI Sidecar — Ocioso",
                menu
            )
            self.icon.run()
        except Exception as e:
            print(f"[TrayApp] Modo headless / bandeja indisponível: {e}")

    def run_in_background(self):
        """Inicia a bandeja em uma thread separada para não bloquear o loop assíncrono."""
        t = threading.Thread(target=self.run, daemon=True)
        t.start()
        return t

    def stop(self):
        if self.icon:
            self.icon.stop()
