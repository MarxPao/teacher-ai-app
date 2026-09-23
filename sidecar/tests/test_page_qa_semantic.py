"""
test_page_qa_semantic.py — Testes do Motor Semântico de Perguntas sobre Telas
"""

import sys
import unittest
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from extension_bridge import ExtensionBridge


class TestPageQASemantic(unittest.TestCase):
    def setUp(self):
        self.bridge = ExtensionBridge(port=0)
        self.machado_data = {
            "sucesso": True,
            "activeTab": "Horários",
            "pageTitle": "machadosobrinho | Painel do Professor",
            "tables": [
                {
                    "id": "grade",
                    "headers": ["HORÁRIO", "DOMINGO", "2ª-FEIRA", "3ª-FEIRA", "4ª-FEIRA", "5ª-FEIRA", "6ª-FEIRA", "SÁBADO"],
                    "rows": [
                        ["1º HORÁRIO (07:15 às 08:05)", "", "", "", "6º ANO A (LING. ING)", "", "7º ANO A (LING. ING)", ""],
                        ["2º HORÁRIO (08:05 às 08:55)", "", "", "", "6º ANO A (LING. ING)", "", "", ""],
                        ["4º HORÁRIO (10:05 às 10:55)", "", "7º ANO A (LING. ING)", "", "", "", "", ""],
                        ["5º HORÁRIO (10:55 às 11:45)", "", "7º ANO A (LING. ING)", "", "", "", "", ""],
                        ["6º HORÁRIO (11:45 às 12:35)", "", "", "6º ANO A (LING. ING)", "", "", "", ""]
                    ]
                }
            ]
        }

    def test_chronological_ordering_full_schedule(self):
        """Valida que a grade completa é SEMPRE listada na ordem cronológica (2ª, 3ª, 4ª, 6ª)."""
        ans = self.bridge._synthesize_page_answer_local("me diga os dias e horarios das minhas aulas", self.machado_data)

        # Deve conter título estruturado com contagem
        assert "Grade Semanal" in ans
        assert "6 aulas" in ans or "aulas" in ans

        # Verifica ordem cronológica estrita no texto
        pos_segunda = ans.find("2ª-feira (Segunda)")
        pos_terca = ans.find("3ª-feira (Terça)")
        pos_quarta = ans.find("4ª-feira (Quarta)")
        pos_sexta = ans.find("6ª-feira (Sexta)")

        assert pos_segunda != -1, "Segunda-feira deve estar presente"
        assert pos_terca != -1, "Terça-feira deve estar presente"
        assert pos_quarta != -1, "Quarta-feira deve estar presente"
        assert pos_sexta != -1, "Sexta-feira deve estar presente"

        # ORDENAÇÃO CRONOLÓGICA ESTRITA
        assert pos_segunda < pos_terca < pos_quarta < pos_sexta, (
            f"Dias fora de ordem cronológica! pos_seg={pos_segunda}, pos_ter={pos_terca}, pos_qua={pos_quarta}, pos_sex={pos_sexta}"
        )

    def test_aggregation_total_classes(self):
        """Valida pergunta de contagem de aulas."""
        ans = self.bridge._synthesize_page_answer_local("quantas aulas eu tenho no total?", self.machado_data)
        assert "6 aulas" in ans
        assert "4 dias letivos" in ans

    def test_filter_specific_turma(self):
        """Valida pergunta filtrando por turma específica."""
        ans = self.bridge._synthesize_page_answer_local("quando eu dou aula para o 7º ano?", self.machado_data)
        assert "7º ano" in ans.lower() or "7º" in ans
        assert "2ª-feira" in ans
        assert "6ª-feira" in ans
        assert "4ª-feira" not in ans, "Não deve listar aulas do 6º ano da 4ª feira"


if __name__ == "__main__":
    unittest.main()
