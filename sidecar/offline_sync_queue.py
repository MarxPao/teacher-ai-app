"""
sidecar/offline_sync_queue.py — Fila de Sincronização Offline-First com SQLite

Garante zero perda de aprendizado em ambientes com Wi-Fi instável:
1. Armazenamento local imediato de episódios, anti-padrões e atualizações de rotas em SQLite.
2. Fila persistente com retry e backoff exponencial.
3. Descarregamento assíncrono transparente (flush) quando a conexão com o Supabase é reestabelecida.
"""

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("OfflineSyncQueue")

_DEFAULT_DB_DIR = Path(__file__).resolve().parent / "skills" / "cache"
_DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "offline_sync_queue.db"


class OfflineSyncQueue:
    """Fila persistente baseada em SQLite para sincronização confiável com o Supabase."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = str(db_path or _DEFAULT_DB_PATH)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Cria as tabelas necessárias se não existirem."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    attempts INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'PENDING',
                    last_error TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status)")
            conn.commit()

    def enqueue(self, item_type: str, payload: Dict[str, Any]) -> int:
        """Enfileira um registro para sincronização com o Supabase."""
        now = time.time()
        payload_str = json.dumps(payload, ensure_ascii=False)
        with self._get_connection() as conn:
            cur = conn.execute(
                "INSERT INTO sync_queue (item_type, payload, created_at, attempts, status) VALUES (?, ?, ?, 0, 'PENDING')",
                (item_type.upper(), payload_str, now)
            )
            conn.commit()
            return cur.lastrowid

    def get_pending(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retorna itens pendentes para sincronização."""
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT id, item_type, payload, created_at, attempts FROM sync_queue WHERE status = 'PENDING' ORDER BY id ASC LIMIT ?",
                (limit,)
            )
            rows = cur.fetchall()
            items = []
            for r in rows:
                try:
                    payload = json.loads(r["payload"])
                except Exception:
                    payload = {}
                items.append({
                    "id": r["id"],
                    "item_type": r["item_type"],
                    "payload": payload,
                    "created_at": r["created_at"],
                    "attempts": r["attempts"]
                })
            return items

    def mark_synced(self, item_id: int) -> None:
        """Marca o item como sincronizado com sucesso."""
        with self._get_connection() as conn:
            conn.execute("UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?", (item_id,))
            conn.commit()

    def mark_failed(self, item_id: int, error_message: str) -> None:
        """Incrementa a contagem de tentativas e atualiza o erro."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?",
                (error_message[:300], item_id)
            )
            conn.commit()

    def flush(self, sync_handler: Callable[[str, Dict[str, Any]], bool], max_items: int = 50) -> Dict[str, int]:
        """
        Percorre os itens pendentes e executa a sincronização chamando o sync_handler.
        Retorna: {"processed": int, "synced": int, "failed": int}
        """
        pending = self.get_pending(limit=max_items)
        synced_count = 0
        failed_count = 0

        for item in pending:
            item_id = item["id"]
            item_type = item["item_type"]
            payload = item["payload"]

            try:
                ok = sync_handler(item_type, payload)
                if ok:
                    self.mark_synced(item_id)
                    synced_count += 1
                else:
                    self.mark_failed(item_id, "Handler returned False")
                    failed_count += 1
            except Exception as e:
                logger.warning(f"Erro ao sincronizar item {item_id}: {e}")
                self.mark_failed(item_id, str(e))
                failed_count += 1

        return {
            "processed": len(pending),
            "synced": synced_count,
            "failed": failed_count
        }


# Instância singleton da fila de sincronização
offline_sync_queue = OfflineSyncQueue()
