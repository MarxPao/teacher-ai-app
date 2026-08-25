"""
auth.py — Autenticação do Sidecar Desktop com o Teacher AI App
Suporta:
1. Fluxo de Device Code (código de 6 dígitos para pareamento no app web)
2. Armazenamento seguro de sessão criptografado no OS Keychain (via keyring)
3. Fallback criptografado AES local para ambientes sem keyring nativo
4. Zero armazenamento de credenciais de portais escolares
"""

import json
import os
import random
import string
import time
from typing import Any, Dict, Optional
import keyring
from cryptography.fernet import Fernet
import base64
import hashlib

SERVICE_NAME = "TeacherAISidecar"
KEY_SESSION = "active_teacher_session"
FALLBACK_SALT_FILE = os.path.expanduser("~/.teacher_ai_sidecar_vault")

def _get_machine_key() -> bytes:
    """Gera uma chave determinística baseada no identificador da máquina local."""
    node_id = str(os.environ.get("COMPUTERNAME", os.environ.get("HOSTNAME", "TeacherAIDefaultNode")))
    user = os.environ.get("USERNAME", os.environ.get("USER", "Teacher"))
    raw = f"{node_id}:{user}:teacher_ai_vault_salt_2026".encode("utf-8")
    h = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(h)

def save_session(user_id: str, email: str, access_token: str, refresh_token: str = "") -> bool:
    """Criptografa e armazena a sessão autenticada do professor."""
    payload = {
        "user_id": user_id,
        "email": email,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "saved_at": time.time()
    }
    serialized = json.dumps(payload)

    # 1. Tenta salvar no OS Keychain nativo
    try:
        keyring.set_password(SERVICE_NAME, KEY_SESSION, serialized)
        return True
    except Exception:
        pass

    # 2. Fallback: arquivo criptografado com Fernet (AES-128-CBC + HMAC)
    try:
        fernet = Fernet(_get_machine_key())
        encrypted = fernet.encrypt(serialized.encode("utf-8"))
        with open(FALLBACK_SALT_FILE, "wb") as f:
            f.write(encrypted)
        return True
    except Exception as e:
        print(f"[Auth] Erro ao persistir sessão: {e}")
        return False

def get_session() -> Optional[Dict[str, Any]]:
    """Recupera e descriptografa a sessão ativa do professor."""
    # 1. Tenta ler do OS Keychain
    try:
        raw = keyring.get_password(SERVICE_NAME, KEY_SESSION)
        if raw:
            return json.loads(raw)
    except Exception:
        pass

    # 2. Fallback: lê do arquivo criptografado
    if os.path.exists(FALLBACK_SALT_FILE):
        try:
            with open(FALLBACK_SALT_FILE, "rb") as f:
                encrypted = f.read()
            fernet = Fernet(_get_machine_key())
            decrypted = fernet.decrypt(encrypted).decode("utf-8")
            return json.loads(decrypted)
        except Exception:
            pass

    return None

def clear_session() -> None:
    """Encerra e apaga a sessão armazenada."""
    try:
        keyring.delete_password(SERVICE_NAME, KEY_SESSION)
    except Exception:
        pass

    if os.path.exists(FALLBACK_SALT_FILE):
        try:
            os.remove(FALLBACK_SALT_FILE)
        except Exception:
            pass

def generate_device_code() -> str:
    """Gera um código de 6 dígitos alfanuméricos formatado (ex: TA-8492)."""
    digits = "".join(random.choices(string.digits, k=4))
    return f"TA-{digits}"
