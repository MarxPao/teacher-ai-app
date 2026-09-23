"""
sidecar/tests/test_file_transfer.py — Testes Unitários de Transferência de Arquivos e Planilhas
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.file_transfer_skill import SpreadsheetHelper, CDPFileTransferSkill


def test_parse_csv_grade_sheet():
    csv_content = """Nome do Aluno,Nota 1,Nota 2,Faltas
Hugo da Silva,9.5,8.0,2
Alice Almeida,10.0,9.5,0
Bernardo Costa,7.0,6.5,4
"""
    entries = SpreadsheetHelper.parse_csv_content(csv_content)

    assert len(entries) == 9  # 3 alunos x 3 colunas (Nota 1, Nota 2, Faltas)
    
    hugo_grades = [e for e in entries if e["student"] == "Hugo da Silva"]
    assert len(hugo_grades) == 3
    assert hugo_grades[0]["column"] == "Nota 1"
    assert hugo_grades[0]["value"] == "9.5"


def test_parse_csv_semicolon_delimiter():
    csv_content = """Aluno;Avaliacao 1;Faltas
Sofia Mendes;8.5;1
Pedro Henrique;9.0;0
"""
    entries = SpreadsheetHelper.parse_csv_content(csv_content)
    assert len(entries) == 4
    assert entries[0]["student"] == "Sofia Mendes"
    assert entries[0]["value"] == "8.5"


def test_format_download_behavior():
    params = CDPFileTransferSkill.format_download_behavior_params("./downloads/boletins")
    assert params["behavior"] == "allow"
    assert "boletins" in params["downloadPath"]
    assert params["eventsEnabled"] is True
