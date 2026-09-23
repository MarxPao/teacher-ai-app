"""
sidecar/skills/file_transfer_skill.py — Interceptor Nativo de Arquivos e Downloads (Excel / PDF)

Permite:
1. Interceptação nativa de caixas de seleção de arquivos (Page.setInterceptFileChooserDialog & DOM.setFileInputFiles).
2. Download silencioso e automático de relatórios escolares e diários em PDF (Page.setDownloadBehavior).
3. SpreadsheetHelper: Conversão direta de planilhas CSV/Excel (.xlsx / .csv) de professores em lote para Turbo Fill.
"""

import csv
import io
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("FileTransferSkill")


class SpreadsheetHelper:
    """Utilitário de leitura e conversão de planilhas escolares de notas e frequências."""

    @classmethod
    def parse_csv_content(cls, content: str, delimiter: str = ",") -> List[Dict[str, Any]]:
        """
        Interpreta conteúdo textual CSV e identifica colunas de Aluno e Notas/Frequência.
        Retorna lista padronizada para injeção via Turbo Fill:
        [ {"student": "Hugo Silva", "column": "Nota 1", "value": "9.5"}, ... ]
        """
        if not content:
            return []

        # Auto-detecta delimitador se houver ponto-e-vírgula comum no Brasil
        if ";" in content and content.count(";") > content.count(","):
            delimiter = ";"

        reader = csv.reader(io.StringIO(content.strip()), delimiter=delimiter)
        rows = [r for r in reader if any(field.strip() for field in r)]
        if not rows:
            return []

        header = [h.strip().lower() for h in rows[0]]
        
        # Encontra índice da coluna de aluno
        student_idx = -1
        for idx, h in enumerate(header):
            if any(term in h for term in ("aluno", "estudante", "nome", "matricula")):
                student_idx = idx
                break

        if student_idx == -1:
            # Assume a primeira coluna como nome do aluno
            student_idx = 0

        # Encontra colunas de valores (notas ou faltas)
        value_cols = []
        for idx, h in enumerate(header):
            if idx != student_idx and any(term in h for term in ("nota", "avalia", "media", "grau", "falta", "presenca", "rec", "p1", "p2")):
                value_cols.append((idx, rows[0][idx]))

        if not value_cols:
            # Se não detectou nome específico, usa a segunda coluna
            if len(header) > 1:
                value_cols.append((1, rows[0][1]))

        parsed_entries = []
        for row in rows[1:]:
            if len(row) <= student_idx:
                continue
            student_name = row[student_idx].strip()
            if not student_name or re.match(r"^(total|media|médias|legenda)", student_name, re.I):
                continue

            for col_idx, col_name in value_cols:
                if col_idx < len(row):
                    val = row[col_idx].strip()
                    if val:
                        parsed_entries.append({
                            "student": student_name,
                            "column": col_name,
                            "columnIndex": col_idx,
                            "value": val
                        })

        return parsed_entries


class CDPFileTransferSkill:
    """Gerencia upload e download de arquivos via Chrome DevTools Protocol."""

    @classmethod
    def get_upload_script(cls, selector: str, file_path: str) -> str:
        """
        Retorna o comando JS para simular a preparação de upload de arquivo no input do navegador.
        """
        abs_path = os.path.abspath(file_path).replace("\\", "/")
        return f"""
        (() => {{
            const input = document.querySelector({repr(selector)});
            if (!input) return {{ success: false, error: "INPUT_NOT_FOUND" }};
            return {{ success: true, target_path: {repr(abs_path)}, input_type: input.type }};
        }})()
        """

    @classmethod
    def format_download_behavior_params(cls, download_path: str) -> Dict[str, Any]:
        """Gera os parâmetros para a chamada Browser.setDownloadBehavior ou Page.setDownloadBehavior."""
        abs_dir = os.path.abspath(download_path)
        return {
            "behavior": "allow",
            "downloadPath": abs_dir,
            "eventsEnabled": True
        }
