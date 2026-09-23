"""
teacher_preference_memory.py — Memória Local de Preferências da Professora (RLHF Individual)

Armazena em banco SQLite local o histórico de escolhas, desambiguações e preferências
individuais da professora para calcular pontuações híbridas e personalizar o comportamento
do motor de inteligência com o tempo.
"""

import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional


class TeacherPreferenceMemory:
    """Gerenciador de memória de preferências e desambiguações da professora."""

    def __init__(self, db_path: str = ":memory:", encryption_key: Optional[str] = None):
        self.db_path = db_path
        self.encryption_key = encryption_key
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        return self._conn

    def _encrypt_val(self, val: str) -> str:
        if not self.encryption_key or not val:
            return val
        import base64, hashlib
        key_bytes = hashlib.sha256(self.encryption_key.encode("utf-8")).digest()
        val_bytes = val.encode("utf-8")
        enc = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(val_bytes)])
        return "enc:" + base64.b64encode(enc).decode("ascii")

    def _decrypt_val(self, val: str) -> str:
        if not self.encryption_key or not val or not str(val).startswith("enc:"):
            return val
        import base64, hashlib
        key_bytes = hashlib.sha256(self.encryption_key.encode("utf-8")).digest()
        raw = base64.b64decode(val[4:].encode("ascii"))
        dec = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(raw)])
        return dec.decode("utf-8")

    def close(self) -> None:
        """Fecha a conexão com o banco de dados."""
        with self._lock:
            if self._conn:
                self._conn.close()

    def _init_db(self) -> None:
        with self._lock:
            with self._conn:
                if self.db_path != ":memory:":
                    try:
                        self._conn.execute("PRAGMA journal_mode=WAL;")
                        self._conn.execute("PRAGMA synchronous=NORMAL;")
                    except Exception:
                        pass
                self._conn.execute("""
                    CREATE TABLE IF NOT EXISTS teacher_preferences (
                        context_key TEXT NOT NULL,
                        choice_value TEXT NOT NULL,
                        selection_count INTEGER DEFAULT 1,
                        last_selected_at TEXT NOT NULL,
                        PRIMARY KEY (context_key, choice_value)
                    )
                """)

    def record_choice(self, context_key: str, choice_value: str) -> None:
        """Registra a seleção de uma opção em determinado contexto."""
        if not context_key or not choice_value:
            return

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S")
        val_to_save = self._encrypt_val(choice_value.strip())
        with self._lock:
            with self._conn:
                self._conn.execute("""
                    INSERT INTO teacher_preferences (context_key, choice_value, selection_count, last_selected_at)
                    VALUES (?, ?, 1, ?)
                    ON CONFLICT(context_key, choice_value) DO UPDATE SET
                        selection_count = selection_count + 1,
                        last_selected_at = excluded.last_selected_at
                """, (context_key.strip().lower(), val_to_save, now_iso))

    def get_preferred_choice(self, context_key: str) -> Optional[str]:
        """Retorna a escolha historicamente mais frequente para o contexto informado."""
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("""
                SELECT choice_value FROM teacher_preferences
                WHERE context_key = ?
                ORDER BY selection_count DESC, last_selected_at DESC
                LIMIT 1
            """, (context_key.strip().lower(),))
            row = cursor.fetchone()
            return self._decrypt_val(row[0]) if row else None

    def get_choice_frequency(self, context_key: str, choice_value: str) -> int:
        """Retorna quantas vezes determinada opção foi selecionada."""
        val_to_query = self._encrypt_val(choice_value.strip())
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("""
                SELECT selection_count FROM teacher_preferences
                WHERE context_key = ? AND choice_value = ?
            """, (context_key.strip().lower(), val_to_query))
            row = cursor.fetchone()
            return row[0] if row else 0

    def calculate_hybrid_score(
        self,
        base_semantic_score: float,
        context_key: str,
        candidate_value: str,
        preference_weight: float = 0.20
    ) -> float:
        """
        Combina o score semântico denso com o reforço da frequência histórica da professora.
        Score = min(1.0, Score_Semantico + preference_weight * Fator_Preferencia)
        """
        freq = self.get_choice_frequency(context_key, candidate_value)
        # Normalização logarítmica da frequência para evitar saturação excessiva
        import math
        pref_factor = min(1.0, math.log(freq + 1) / math.log(10)) if freq > 0 else 0.0

        hybrid = min(1.0, base_semantic_score + preference_weight * pref_factor)
        return round(hybrid, 4)

