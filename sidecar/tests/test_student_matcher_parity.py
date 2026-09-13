"""
sidecar/tests/test_student_matcher_parity.py — Teste de Paridade Estrita Python <-> TypeScript

Garante que o motor de reconciliação em 4 vias implementado em Python
(sidecar/student_matcher.py) e em TypeScript (lib/studentMatcher.ts)
retornam exatamente o mesmo resultado para o mesmo conjunto de alunos e queries.

Atua como um ALARME AUTOMÁTICO caso qualquer uma das implementações
divirja no futuro em regras de matching, matrícula ou desambiguação.
"""

import json
import subprocess
import sys
from pathlib import Path
import pytest

# Adiciona o diretório sidecar ao sys.path
SIDECAR_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SIDECAR_DIR.parent
if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))

from student_matcher import match_student_4_ways


CANONICAL_ROSTER = [
    {
        "id": "stu_1",
        "name": "Hugo Henrique Lima",
        "matricula": "2026-001",
        "class_name": "9º Ano A",
        "school_name": "Machado Sobrinho"
    },
    {
        "id": "stu_2",
        "name": "Hugo Henrique Souza",
        "matricula": "2026-002",
        "class_name": "9º Ano B",
        "school_name": "Machado Sobrinho"
    },
    {
        "id": "stu_3",
        "name": "Ana Clara Santos",
        "matricula": "2026-003",
        "class_name": "8º Ano A",
        "school_name": "Rede Santa Catarina"
    },
    {
        "id": "stu_4",
        "name": "Ana Luiza Santos",
        "matricula": "2026-004",
        "class_name": "8º Ano A",
        "school_name": "Rede Santa Catarina"
    },
    {
        "id": "stu_5",
        "name": "Gabriel Silva",
        "matricula": "2026-005",
        "class_name": "7º Ano B",
        "school_name": "Machado Sobrinho"
    },
    {
        "id": "stu_6",
        "name": "Gabriela Silva",
        "matricula": "2026-006",
        "class_name": "7º Ano C",
        "school_name": "Machado Sobrinho"
    },
    {
        "id": "stu_7",
        "name": "Carlos Eduardo",
        "matricula": "2026-007",
        "class_name": "6º Ano A",
        "school_name": "Machado Sobrinho"
    }
]

TEST_SCENARIOS = [
    {
        "desc": "1. Match exato por nome completo",
        "query_name": "Hugo Henrique Lima",
        "matricula": None,
        "class_ref": None,
        "expected_status": "exact",
        "expected_name": "Hugo Henrique Lima"
    },
    {
        "desc": "2. Homônimos com mesmo nome sem matrícula (deve ser AMBÍGUO em ambos)",
        "query_name": "Hugo Henrique",
        "matricula": None,
        "class_ref": None,
        "expected_status": "ambiguous",
        "expected_candidates_count": 2
    },
    {
        "desc": "3. Homônimos desambiguados deterministicamente por matrícula (Via 1)",
        "query_name": "Hugo Henrique",
        "matricula": "2026-002",
        "class_ref": None,
        "expected_status": "exact",
        "expected_name": "Hugo Henrique Souza"
    },
    {
        "desc": "4. Homônimos desambiguados por turma (Via 2)",
        "query_name": "Hugo Henrique",
        "matricula": None,
        "class_ref": "9º Ano A",
        "expected_status": "exact",
        "expected_name": "Hugo Henrique Lima"
    },
    {
        "desc": "5. Busca digitando diretamente a matrícula",
        "query_name": "2026-005",
        "matricula": None,
        "class_ref": None,
        "expected_status": "exact",
        "expected_name": "Gabriel Silva"
    },
    {
        "desc": "6. Primeiro nome com múltiplos homônimos (Ana)",
        "query_name": "Ana",
        "matricula": None,
        "class_ref": None,
        "expected_status": "ambiguous",
        "expected_candidates_count": 2
    },
    {
        "desc": "7. Aluno inexistente (not_found em ambos)",
        "query_name": "Zulmira de Albuquerque Inexistente",
        "matricula": None,
        "class_ref": None,
        "expected_status": "not_found",
        "expected_name": None
    },
    {
        "desc": "8. Normalização sem acentos e em minúsculas",
        "query_name": "gabriel silva",
        "matricula": None,
        "class_ref": None,
        "expected_status": "exact",
        "expected_name": "Gabriel Silva"
    }
]


def run_ts_batch(scenarios, roster):
    """Executa o lote de cenários no motor TypeScript (lib/studentMatcher.ts) via npx tsx em uma única chamada."""
    runner_path = SIDECAR_DIR / "tests" / "ts_matcher_runner.ts"
    payload = json.dumps({"scenarios": scenarios, "roster": roster})
    proc = subprocess.run(
        ["npx", "tsx", str(runner_path)],
        input=payload,
        text=True,
        capture_output=True,
        cwd=str(PROJECT_ROOT),
        shell=True,
        timeout=30
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Falha ao executar TS matcher: {proc.stderr}")
    return json.loads(proc.stdout)


def test_student_matcher_cross_language_parity():
    """
    Roda os cenários contra Python e TypeScript e compara 100% da resposta:
    - Status idêntico ('exact', 'ambiguous', 'not_found', 'confident_match')
    - Aluno selecionado idêntico
    - Quantidade e nomes de candidatos a desambiguação idênticos
    """
    ts_results = run_ts_batch(TEST_SCENARIOS, CANONICAL_ROSTER)
    assert len(ts_results) == len(TEST_SCENARIOS)

    for idx, sc in enumerate(TEST_SCENARIOS):
        desc = sc["desc"]
        q_name = sc["query_name"]
        q_mat = sc["matricula"]
        q_cls = sc["class_ref"]

        # Execução Python
        py_res = match_student_4_ways(
            query_name=q_name,
            roster=CANONICAL_ROSTER,
            query_matricula=q_mat,
            class_ref=q_cls
        )

        # Execução TypeScript
        ts_res = ts_results[idx]

        # 1. Paridade de Status
        assert py_res.status == ts_res["status"], (
            f"Divergência de status no cenário '{desc}': "
            f"Python retornou '{py_res.status}', mas TypeScript retornou '{ts_res['status']}'"
        )
        assert py_res.status == sc["expected_status"], (
            f"Status inesperado no cenário '{desc}': esperado '{sc['expected_status']}', obtido '{py_res.status}'"
        )

        # 2. Paridade de Aluno Selecionado (quando match com sucesso)
        if sc["expected_status"] == "exact":
            assert py_res.student is not None, f"Python student é None para '{desc}'"
            assert ts_res["student"] is not None, f"TypeScript student é null para '{desc}'"
            assert py_res.student.name == ts_res["student"]["name"], (
                f"Divergência de aluno selecionado no cenário '{desc}': "
                f"Python='{py_res.student.name}' vs TS='{ts_res['student']['name']}'"
            )
            assert py_res.student.name == sc["expected_name"]

        # 3. Paridade em Caso Ambíguo (ambos devem barrar e listar os mesmos homônimos)
        elif sc["expected_status"] == "ambiguous":
            assert py_res.student is None, f"Python não deve selecionar aluno em ambiguidade ('{desc}')"
            assert ts_res["student"] is None, f"TS não deve selecionar aluno em ambiguidade ('{desc}')"

            py_cand_names = sorted([c.name for c in py_res.candidates])
            ts_cand_names = sorted([c["name"] for c in ts_res["candidates"]])
            assert py_cand_names == ts_cand_names, (
                f"Divergência nos candidatos a desambiguação no cenário '{desc}': "
                f"Python={py_cand_names} vs TS={ts_cand_names}"
            )
            assert len(py_cand_names) == sc["expected_candidates_count"]

        # 4. Paridade em Caso Not Found
        elif sc["expected_status"] == "not_found":
            assert py_res.student is None
            assert ts_res["student"] is None
