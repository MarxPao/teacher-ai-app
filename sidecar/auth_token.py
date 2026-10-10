"""
sidecar/auth_token.py — Gerenciador de Token de Autenticação do Sidecar (Teacher AI)

Garante que apenas clientes legítimos (extensão Chrome pareada e app local autorizado)
possam enviar comandos ao Sidecar nas portas 8765 (HTTP) e 8766 (WebSocket).
"""

import hmac
import os
import secrets
from pathlib import Path
from typing import Optional

_ACTIVE_TOKEN: Optional[str] = None


def get_token_storage_path() -> Path:
    """Retorna o caminho seguro para persistir o token do sidecar."""
    home_dir = Path.home() / ".teacher-ai"
    try:
        home_dir.mkdir(parents=True, exist_ok=True)
        return home_dir / "sidecar_auth_token"
    except Exception:
        # Fallback para diretório temporário caso a home não seja gravável
        import tempfile
        fallback_dir = Path(tempfile.gettempdir()) / "teacher-ai"
        fallback_dir.mkdir(parents=True, exist_ok=True)
        return fallback_dir / "sidecar_auth_token"


def initialize_auth_token(explicit_token: Optional[str] = None) -> str:
    """
    Inicializa o token de autenticação do sidecar.
    Se explicit_token for fornecido, usa-o.
    Caso contrário, gera um token aleatório criptograficamente forte (secrets.token_urlsafe).
    Persiste no arquivo protegido por permissões restritas.
    """
    global _ACTIVE_TOKEN

    env_token = os.environ.get("TEACHERAI_SIDECAR_TOKEN")
    token = explicit_token or env_token or secrets.token_urlsafe(32)

    token_path = get_token_storage_path()
    try:
        # Salva o token no disco
        token_path.write_text(token.strip(), encoding="utf-8")
        # No Unix/macOS, restringe permissões para 0o600 (apenas o usuário atual pode ler)
        if hasattr(os, "chmod") and os.name != "nt":
            try:
                os.chmod(token_path, 0o600)
            except Exception:
                pass
    except Exception as e:
        print(f"[SidecarAuth] Aviso: Nao foi possivel persistir o token em {token_path}: {e}")

    _ACTIVE_TOKEN = token.strip()
    return _ACTIVE_TOKEN


def get_current_auth_token() -> str:
    """Retorna o token ativo atual, inicializando-o caso necessário."""
    global _ACTIVE_TOKEN
    if _ACTIVE_TOKEN is None:
        token_path = get_token_storage_path()
        if token_path.exists():
            try:
                saved = token_path.read_text(encoding="utf-8").strip()
                if saved:
                    _ACTIVE_TOKEN = saved
                    return _ACTIVE_TOKEN
            except Exception:
                pass
        _ACTIVE_TOKEN = initialize_auth_token()
    return _ACTIVE_TOKEN


def verify_auth_token(token_to_check: Optional[str]) -> bool:
    """
    Compara o token recebido contra o token ativo usando compare_digest
    para imunidade contra ataques de análise de tempo (timing attacks).
    """
    if not token_to_check:
        return False
    active = get_current_auth_token()
    return hmac.compare_digest(str(token_to_check).strip(), active)
