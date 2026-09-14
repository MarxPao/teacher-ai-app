"""
cdp_connector.py — Conector Chrome DevTools Protocol (CDP) e Detector de Desafios
Gerencia a conexão com o Google Chrome aberto pelo professor e detecta bloqueios/CAPTCHAs.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional, Tuple
import requests
from playwright.async_api import Browser, BrowserContext, Page, async_playwright

class CDPConnector:
    def __init__(self, cdp_url: str = "http://localhost:9222"):
        self.cdp_url = cdp_url
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None

    @staticmethod
    def find_chrome_executable() -> Optional[str]:
        """Localiza o executável do Google Chrome na máquina Windows."""
        import os
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        return None

    @staticmethod
    def get_profile_target_info() -> Dict[str, str]:
        """Retorna as informações do perfil da professora (Rafaela ELT)."""
        import os
        user_data = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")
        chrome_exe = CDPConnector.find_chrome_executable() or "chrome.exe"
        return {
            "profile_name": "Rafaela ELT",
            "profile_directory": "Profile 1",
            "user_data_dir": user_data,
            "chrome_exe": chrome_exe,
            "cdp_port": "9222",
            "launch_command": f'"{chrome_exe}" --remote-debugging-port=9222 --user-data-dir="{user_data}" --profile-directory="Profile 1" --restore-last-session'
        }

    @staticmethod
    def _is_chrome_process_running() -> bool:
        """Verifica se há algum processo chrome.exe ativo no Windows de forma 100% silenciosa (Win32 API pura)."""
        try:
            import ctypes
            from ctypes import wintypes

            TH32CS_SNAPPROCESS = 0x00000002
            class PROCESSENTRY32W(ctypes.Structure):
                _fields_ = [
                    ('dwSize', wintypes.DWORD),
                    ('cntUsage', wintypes.DWORD),
                    ('th32ProcessID', wintypes.DWORD),
                    ('th32DefaultHeapID', ctypes.c_size_t),
                    ('th32ModuleID', wintypes.DWORD),
                    ('cntThreads', wintypes.DWORD),
                    ('th32ParentProcessID', wintypes.DWORD),
                    ('pcPriClassBase', wintypes.LONG),
                    ('dwFlags', wintypes.DWORD),
                    ('szExeFile', wintypes.WCHAR * 260)
                ]

            hSnapshot = ctypes.windll.kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
            if hSnapshot == -1:
                return False
            entry = PROCESSENTRY32W()
            entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
            res = ctypes.windll.kernel32.Process32FirstW(hSnapshot, ctypes.byref(entry))
            running = False
            while res:
                if entry.szExeFile.lower() == "chrome.exe":
                    running = True
                    break
                res = ctypes.windll.kernel32.Process32NextW(hSnapshot, ctypes.byref(entry))
            ctypes.windll.kernel32.CloseHandle(hSnapshot)
            return running
        except Exception:
            return False

    def get_connection_state(self) -> str:
        """
        Retorna o estado da conexão:
          'ready'            -> Navegador conectado e pronto para leitura
          'needs_activation' -> Chrome aberto normalmente (precisa preparar/ativar)
          'closed'           -> Chrome não está aberto
        """
        is_ok, _ = self.check_health()
        if is_ok:
            return "ready"
        if self._is_chrome_process_running():
            return "needs_activation"
        return "closed"

    def check_health(self) -> Tuple[bool, str]:
        """Verifica se o Chrome está pronto para leitura de portais (sem jargões na mensagem)."""
        try:
            r = requests.get(f"{self.cdp_url}/json/version", timeout=2.0)
            if r.status_code == 200:
                data = r.json()
                browser_ver = data.get("Browser", "Chrome")
                return (True, f"Navegador conectado ({browser_ver}) e pronto para leitura.")
            return (False, "Navegador não respondeu à tentativa de conexão.")
        except Exception:
            if self._is_chrome_process_running():
                return (
                    False,
                    "O Google Chrome está aberto, mas precisa ser preparado para que eu possa ler o portal da sua turma. "
                    "Clique em 'Conectar Navegador' para ativar mantendo todas as suas abas abertas."
                )
            return (
                False,
                "O Google Chrome não está aberto no momento. Abra o Chrome ou clique em 'Conectar Navegador' para iniciar."
            )

    @classmethod
    def relaunch_chrome_with_cdp(cls, profile_name: str = "Profile 1", timeout_sec: float = 6.0) -> Tuple[bool, str]:
        """
        Inicia ou conecta à janela dedicada do Google Chrome do Teacher AI com perfil persistente.
        Zero conflito com o Chrome pessoal da professora (não fecha abas pessoais nem disputa processos).
        Delega para chrome_launcher.launch_dedicated_chrome() que é a fonte canônica de lançamento.
        """
        try:
            from chrome_launcher import launch_dedicated_chrome
            ok, msg = launch_dedicated_chrome()
            return (ok, msg)
        except ImportError:
            pass

        # Fallback inline (caso o módulo não seja encontrado — compatibilidade)
        import subprocess
        import time
        import os

        conn = cls("http://localhost:9222")
        is_ok, _ = conn.check_health()
        if is_ok:
            return (True, "Navegador do Teacher AI conectado e pronto para leitura.")

        chrome_exe = cls.find_chrome_executable()
        if not chrome_exe:
            return (False, "Não encontramos o Google Chrome instalado no computador.")

        profile_dir = os.path.expandvars(r"%LOCALAPPDATA%\TeacherAI\browser_profile")
        os.makedirs(profile_dir, exist_ok=True)

        cmd = [
            chrome_exe,
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=9222",
            "--remote-allow-origins=*",
            "--no-first-run",
            "--no-default-browser-check",
            "--restore-last-session",
            "--disable-sync",
        ]

        try:
            subprocess.Popen(cmd, close_fds=True)
        except Exception as e:
            return (False, f"Falha ao iniciar o Google Chrome: {e}")

        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            time.sleep(0.5)
            is_ok, msg = conn.check_health()
            if is_ok:
                return (True, "Navegador do Teacher AI conectado! Suas abas pessoais continuam intactas.")

        return (True, "Navegador iniciado. Se for o primeiro acesso, faça login no portal da sua escola.")

    async def connect(self) -> BrowserContext:
        """Conecta ao browser local via CDP."""
        if not self._playwright:
            self._playwright = await async_playwright().start()

        if not self._browser:
            self._browser = await self._playwright.chromium.connect_over_cdp(self.cdp_url)
            self._context = self._browser.contexts[0] if self._browser.contexts else await self._browser.new_context()

        return self._context

    async def find_portal_page(self, portal_keyword: str = "") -> Optional[Page]:
        """Localiza a aba do portal alvo no navegador (Machado Sobrinho ou termo informado)."""
        context = await self.connect()
        kw = portal_keyword.lower().strip() if portal_keyword else ""
        host = ""
        if kw:
            from urllib.parse import urlparse
            val = kw if "://" in kw else f"http://{kw}"
            try:
                host = (urlparse(val).hostname or "").lower()
            except Exception:
                host = ""

        machado_keywords = ["machadosobrinho", "paineldoaluno", "paineldoprofessor", "professor_painel", "meus alunos"]

        for p in context.pages:
            url = p.url.lower()
            title = (await p.title()).lower()
            if kw and (kw in url or kw in title or (host and host in url)):
                return p
            if not kw and any(mk in url or mk in title for mk in machado_keywords):
                return p

        # Fallback de segurança: retorna a página ativa existente sem navegar para domínios de terceiros
        if context.pages:
            return context.pages[0]
        page = await context.new_page()
        return page

    async def detect_security_challenge(self, page: Page) -> Tuple[bool, str]:
        """
        Detecta se a página atual está exibindo tela de login, CAPTCHA pendente, 2FA ou bloqueio.
        Retorna (is_blocked, challenge_type).
        """
        try:
            url_lower = (page.url or "").lower()

            # 1. Verifica se a URL atual é uma página de login/autenticação
            if any(term in url_lower for term in ["/login", "/professor_login", "/auth", "/signin"]):
                return (True, "A janela do navegador dedicada está na tela de login. Digite seu CPF e senha e clique no botão ENTRAR para acessar a turma.")

            # 2. Verifica presença de campos típicos de formulário de login (CPF/senha)
            has_login_inputs = await page.locator("input[type='password'], input[name*='senha' i], input[placeholder*='CPF' i]").count() > 0
            if has_login_inputs:
                return (True, "A janela do navegador dedicada está solicitando login. Digite seu CPF e clique em ENTRAR para exibir a turma.")

            # 3. Verifica palavras-chave de sessão expirada ou reautenticação no DOM
            page_text = (await page.content()).lower()
            if "verifique se você está logado" in page_text or "sua sessão expirou" in page_text:
                return (True, "Sessão não iniciada no portal escolar. Faça login com seu CPF na janela do navegador dedicada.")

            # 4. Verifica presença de CAPTCHA bloqueante (recaptcha / hcaptcha / turnstile pendente)
            has_recaptcha = await page.locator(
                "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], div.g-recaptcha, div#cf-turnstile"
            ).count() > 0
            if has_recaptcha:
                return (True, "Desafio CAPTCHA ativo na janela do navegador dedicado. Resolva a verificação na janela para continuar.")

            block_keywords = [
                "código de verificação", "autenticação em duas etapas",
                "verifique seu email", "digite o código enviado", "access denied"
            ]
            for kw in block_keywords:
                if kw in page_text:
                    return (True, f"Tela de segurança detectada ('{kw}'). Conclua o acesso na janela do navegador.")

            return (False, "")
        except Exception:
            return (False, "")

    async def close(self):
        """Fecha a conexão CDP suavemente sem fechar o navegador do professor."""
        try:
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        finally:
            self._browser = None
            self._playwright = None
            self._context = None
