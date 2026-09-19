"""
sidecar/tests/test_turbo_matrix.py — Testes Unitários do Turbo Fill (Batch Matrix Injector)
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import AsyncMock

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.turbo_matrix_skill import TurboMatrixInjector


def test_generate_batch_injection_script():
    entries = [
        {"student": "Hugo Silva", "column": "Nota 1", "value": "9.5"},
        {"student": "Alice Almeida", "column": "Nota 1", "value": "10.0"},
        {"student": "Bernardo Costa", "column": "Nota 1", "value": "8.0"}
    ]
    script = TurboMatrixInjector.generate_batch_injection_script(entries, table_selector="table#gridNotas")

    assert "nativeInputValueSetter" in script
    assert "Hugo Silva" in script
    assert "Alice Almeida" in script
    assert "table#gridNotas" in script
    assert "dispatchEvent(new Event('input'" in script
    assert "dispatchEvent(new Event('change'" in script


@pytest.mark.asyncio
async def test_execute_turbo_fill_success():
    class MockPage:
        def __init__(self):
            self.evaluate = AsyncMock(return_value={
                "total_entries": 2,
                "success_count": 2,
                "failed_count": 0,
                "all_success": True,
                "results": [
                    {"student": "Hugo Silva", "success": True, "previous_value": "7.0", "new_value": "9.5"},
                    {"student": "Alice Almeida", "success": True, "previous_value": "9.0", "new_value": "10.0"}
                ]
            })

    mock_page = MockPage()
    entries = [
        {"student": "Hugo Silva", "value": "9.5"},
        {"student": "Alice Almeida", "value": "10.0"}
    ]
    res = await TurboMatrixInjector.execute_turbo_fill(mock_page, entries)

    assert res["all_success"] is True
    assert res["success_count"] == 2
    assert len(res["results"]) == 2
    assert res["results"][0]["new_value"] == "9.5"
