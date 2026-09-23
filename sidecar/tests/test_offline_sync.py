"""
sidecar/tests/test_offline_sync.py — Testes Unitários da Fila de Sincronização Offline-First
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from offline_sync_queue import OfflineSyncQueue


def test_enqueue_and_get_pending(tmp_path):
    db_file = tmp_path / "test_queue.db"
    queue = OfflineSyncQueue(db_path=str(db_file))

    # 1. Enfileira 2 itens
    id1 = queue.enqueue("EPISODE", {"portal_id": "santacatarina", "outcome": "SUCCESS"})
    id2 = queue.enqueue("ANTI_PATTERN", {"portal_id": "santacatarina", "reason": "Botão travado"})

    assert id1 > 0
    assert id2 > id1

    # 2. Consulta itens pendentes
    pending = queue.get_pending(limit=10)
    assert len(pending) == 2
    assert pending[0]["item_type"] == "EPISODE"
    assert pending[0]["payload"]["portal_id"] == "santacatarina"
    assert pending[1]["item_type"] == "ANTI_PATTERN"


def test_flush_queue_success_and_retry(tmp_path):
    db_file = tmp_path / "test_queue.db"
    queue = OfflineSyncQueue(db_path=str(db_file))

    # Enfileira 3 itens
    queue.enqueue("EPISODE", {"idx": 1})
    queue.enqueue("EPISODE", {"idx": 2})
    queue.enqueue("EPISODE", {"idx": 3})

    # Simula handler onde idx 1 e 3 funcionam, mas idx 2 falha temporariamente
    def mock_handler(item_type, payload):
        if payload.get("idx") == 2:
            raise ConnectionError("Wi-Fi caiu")
        return True

    res = queue.flush(mock_handler)
    assert res["processed"] == 3
    assert res["synced"] == 2
    assert res["failed"] == 1

    # Verifica se apenas o item 2 continua pendente com contagem de tentativas = 1
    remaining = queue.get_pending(limit=10)
    assert len(remaining) == 1
    assert remaining[0]["payload"]["idx"] == 2
    assert remaining[0]["attempts"] == 1
