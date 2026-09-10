"""
tray_app.py — Ícone de Bandeja do Sistema (System Tray) para o Sidecar Desktop
Exibe status visual em tempo real e permite preparar o navegador com 1 clique (sem jargões técnicos).
"""

import threading
import time
import webbrowser
from typing import Any, Callable, Optional
from PIL import Image, ImageDraw

class TrayApp:
    def __init__(
        self,
        on_exit: Optional[Callable] = None,
        on_prepare_browser: Optional[Callable] = None,
        cdp_connector: Optional[Any] = None
    ):
        self.on_exit = on_exit
        self.on_prepare_browser = on_prepare_browser
        self.cdp = cdp_connector
        self.icon = None
        self.status = "idle"
        self.status_text = "Iniciando..."
        self._is_active_task = False
        self._watchdog_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def _create_icon_image(self, color: str = "#16a34a") -> Image.Image:
        """Gera uma imagem de ícone estilizada em memória com a paleta do Teacher AI."""
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Fundo circular com cor de estado
        draw.ellipse([4, 4, 60, 60], fill=color, outline="#ffffff", width=2)

        # Olhos de coruja estilizados
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
        self._is_active_task = (status in ("running", "waiting"))

        colors = {
            "ready": "#16a34a",            # Verde - Conectado
            "idle": "#16a34a",             # Verde
            "needs_activation": "#d97706", # Âmbar - Aberto mas precisa ativar
            "closed": "#6b7280",           # Cinza - Navegador fechado
            "running": "#2563eb",          # Azul - Executando
            "waiting": "#2563eb",          # Azul
            "error": "#dc2626"             # Vermelho
        }
        color = colors.get(status, "#16a34a")

        if self.icon:
            try:
                self.icon.icon = self._create_icon_image(color)
                self.icon.title = f"Teacher AI — {text}"
            except Exception:
                pass

    def _trigger_prepare_browser(self):
        """Ação de 1 clique para preparar o navegador mantendo as abas."""
        def _run():
            self.update_status("running", "Preparando navegador...")
            if self.on_prepare_browser:
                self.on_prepare_browser()
            else:
                from cdp_connector import CDPConnector
                success, msg = CDPConnector.relaunch_chrome_with_cdp(profile_name="Profile 1")
                if success:
                    self.update_status("ready", "Navegador Conectado")
                else:
                    self.update_status("needs_activation", msg)

        threading.Thread(target=_run, daemon=True).start()

    def _open_portal_panel(self):
        """Abre o painel do app no navegador padrão."""
        try:
            webbrowser.open("http://localhost:3000")
        except Exception:
            pass

    def _watchdog_loop(self):
        """Monitora o estado do navegador a cada 3 segundos em background."""
        from cdp_connector import CDPConnector
        conn = self.cdp or CDPConnector()

        while not self._stop_event.is_set():
            if not self._is_active_task:
                try:
                    state = conn.get_connection_state()
                    if state == "ready":
                        self.update_status("ready", "Navegador Conectado")
                    elif state == "needs_activation":
                        self.update_status("needs_activation", "Navegador Aberto (Clique para Conectar)")
                    else:
                        self.update_status("closed", "Navegador Fechado")
                except Exception:
                    pass

            self._stop_event.wait(3.0)

    def run(self):
        """Inicia o ícone de bandeja e inicia o watchdog."""
        try:
            import pystray

            menu = pystray.Menu(
                pystray.MenuItem(lambda text: f"● {self.status_text}", None, enabled=False),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("🔄 Preparar Navegador (1 clique)", lambda: self._trigger_prepare_browser()),
                pystray.MenuItem("🌐 Abrir Painel do Professor", lambda: self._open_portal_panel()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Sair do Teacher AI", lambda: self.on_exit() if self.on_exit else self.stop())
            )

            self.icon = pystray.Icon(
                "TeacherAISidecar",
                self._create_icon_image("#16a34a"),
                "Teacher AI — Conectando...",
                menu
            )

            # Inicia o watchdog do navegador
            self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
            self._watchdog_thread.start()

            self.icon.run()
        except Exception as e:
            print(f"[TrayApp] Modo headless / bandeja indisponível: {e}")

    def run_in_background(self):
        """Inicia a bandeja em uma thread separada para não bloquear o loop assíncrono."""
        t = threading.Thread(target=self.run, daemon=True)
        t.start()
        return t

    def stop(self):
        self._stop_event.set()
        if self.icon:
            try:
                self.icon.stop()
            except Exception:
                pass
