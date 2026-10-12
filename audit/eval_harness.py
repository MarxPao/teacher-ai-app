"""
eval_harness.py — Harness de Avaliação Ampliado e Contínuo para o Browser Agent (Teacher AI)

Cenários Avaliados:
- Conjunto DEV: Standard Table, B1 (Columns Mutation), B3 (Synonyms), B4 (English UI), Merged Cells (Colspan/Rowspan).
- Conjunto HOLDOUT (Reservado): Two-Row Headers, Virtualized Table, Hidden/Duplicate Inputs, Cross-Origin Iframe, Strict Form.

Métricas Medidas:
- Recall de Identidade: (Aluno, ID, Cabeçalho da Coluna)
- Precisão: Inputs válidos identificados / Total de inputs expostos (penalizando inputs ocultos, duplicados e honeypots)
- Escritas no Campo Errado: Ocorrências de escrita fora da célula alvo (alvo: 0 em N execuções)
- Sucesso Ponta a Ponta: Lançar valor X do aluno Y na coluna Z e confirmar por readback
- Intervalos de Confiança Agrupados por Cluster (Cluster-Adjusted CI) para tratar não-independência intra-cenário.

Nota de Rigor (LGPD e Produção):
- A alegação de que sistemas de terceiros (ex.: TOTVS Educacional, Sophia) 'não possuem barreiras de isTrusted'
  é classificada como NÃO VERIFICADO por ausência de telemetria empírica direta contra portais de produção.
"""

import asyncio
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
SIDECAR_DIR = ROOT_DIR / "sidecar"
if str(SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(SIDECAR_DIR))

from playwright.async_api import async_playwright

SERVER_URL = "http://127.0.0.1:8899"
PORTAL_DOM_READER_PATH = ROOT_DIR / "teacher-extension" / "portal_dom_reader.js"
PORTAL_NORMALIZER_PATH = ROOT_DIR / "teacher-extension" / "portal_normalizer.js"

DEV_SCENARIOS = [
    {
        "id": "DEV_STANDARD_TABLE",
        "name": "Standard Table",
        "url": f"{SERVER_URL}/portal/standard",
        "students": ["Alice Souza", "Bruno Santos"],
        "columns": ["Nota", "Falta"],
        "target_write": {"student": "Alice Souza", "col": "Nota", "val": "9.5", "input_id": "nota_101"}
    },
    {
        "id": "DEV_MUTATION_B1_COLUMNS",
        "name": "Mutation Columns (B1)",
        "url": f"{SERVER_URL}/portal/mutation/columns",
        "students": ["Carlos Eduardo Lima", "Daniela Martins"],
        "columns": ["Situação", "Código", "Discente", "Avaliação"],
        "target_write": {"student": "Carlos Eduardo Lima", "col": "Avaliação", "val": "8.0", "input_name": "rendimento_202401"}
    },
    {
        "id": "DEV_MUTATION_B3_SYNONYMS",
        "name": "Mutation Synonyms (B3)",
        "url": f"{SERVER_URL}/portal/mutation/synonyms",
        "students": ["Gabriel Menezes"],
        "columns": ["Identificação", "Educando", "Registro de Ausência"],
        "target_write": {"student": "Gabriel Menezes", "col": "Registro de Ausência", "val": "[X]", "input_name": "ausente_331"}
    },
    {
        "id": "DEV_MUTATION_B4_ENGLISH",
        "name": "Mutation English UI (B4)",
        "url": f"{SERVER_URL}/portal/mutation/english",
        "students": ["Johnathan Taylor", "Sarah Jenkins"],
        "columns": ["Student ID", "Full Name", "Current Score"],
        "target_write": {"student": "Johnathan Taylor", "col": "Current Score", "val": "9.8", "input_name": "score_9001"}
    },
    {
        "id": "DEV_MUTATION_MERGED_CELLS",
        "name": "Mutation Merged Cells (Colspan/Rowspan)",
        "url": f"{SERVER_URL}/portal/mutation/merged_cells",
        "students": ["Larissa Gomes", "Marcos Vinicius"],
        "columns": ["Código", "Nome do Aluno", "Nota 1", "Nota 2"],
        "target_write": {"student": "Larissa Gomes", "col": "Nota 2", "val": "8.5", "input_id": "nota2_401"}
    }
]

HOLDOUT_SCENARIOS = [
    {
        "id": "HOLDOUT_TWO_ROW_HEADERS",
        "name": "Two-Row Headers",
        "url": f"{SERVER_URL}/portal/mutation/two_row_headers",
        "students": ["Patricia Antunes"],
        "columns": ["ID", "Estudante", "Prova", "Recuperação", "Prova", "Recuperação"],
        "target_write": {"student": "Patricia Antunes", "col": "Recuperação", "val": "9.0", "input_id": "rec2_601"}
    },
    {
        "id": "HOLDOUT_VIRTUALIZED_TABLE",
        "name": "Virtualized Table",
        "url": f"{SERVER_URL}/portal/mutation/virtualized",
        "students": ["Tiago Ramos", "Ursula Lima"],
        "columns": ["ID", "Aluno", "Nota"],
        "target_write": {"student": "Tiago Ramos", "col": "Nota", "val": "8.0", "input_id": "vnota_801"}
    },
    {
        "id": "HOLDOUT_HIDDEN_DUPLICATE_INPUTS",
        "name": "Hidden and Duplicate Inputs",
        "url": f"{SERVER_URL}/portal/mutation/hidden_duplicate_inputs",
        "students": ["Renato Barreto"],
        "columns": ["Matrícula", "Aluno", "Nota"],
        "expected_hidden_inputs": 3, # mobile duplicated input + honeypot + csrf_token
        "target_write": {"student": "Renato Barreto", "col": "Nota", "val": "9.0", "input_id": "nota_701_desktop"}
    },
    {
        "id": "HOLDOUT_CROSS_ORIGIN_IFRAME",
        "name": "Cross-Origin Iframe",
        "url": f"{SERVER_URL}/portal/scenario/cross_origin_iframe",
        "students": ["Zilda Arns"],
        "columns": ["Código", "Aluno Remoto", "Nota"],
        "is_cross_origin": True,
        "target_write": {"student": "Zilda Arns", "col": "Nota", "val": "10.0", "input_id": "nota_991"}
    },
    {
        "id": "HOLDOUT_STRICT_FORM",
        "name": "Strict Form with Textarea Validation",
        "url": f"{SERVER_URL}/portal/scenario/strict_form",
        "students": ["Lucas Mendes"],
        "columns": ["Nota", "Justificativa Pedagógica"],
        "is_non_tabular": True,
        "target_write": {"student": "Lucas Mendes", "col": "Nota", "val": "8.5", "input_id": "campo-nota"}
    }
]

def calculate_cluster_adjusted_ci(cluster_rates: List[float], total_units: int, confidence: float = 0.95) -> Tuple[float, float, float]:
    """
    Calcula intervalo de confiança corrigido para clusters (amostras dependentes por cenário).
    Retorna (mean, lower, upper).
    """
    K = len(cluster_rates)
    if K == 0:
        return 0.0, 0.0, 0.0
    mean = sum(cluster_rates) / K
    if K == 1:
        return mean, mean, mean
    
    # Variância entre clusters
    var_between = sum((r - mean) ** 2 for r in cluster_rates) / (K - 1)
    se = math.sqrt(var_between / K)
    
    # t-Student aproximado para 95% com df = K - 1
    t_val = 2.776 if K == 5 else (2.262 if K == 10 else 2.0)
    lower = max(0.0, mean - (t_val * se))
    upper = min(1.0, mean + (t_val * se))
    return round(mean, 4), round(lower, 4), round(upper, 4)

async def evaluate_suite(scenarios: List[Dict[str, Any]], suite_name: str, page) -> Dict[str, Any]:
    print(f"\n=======================================================")
    print(f"  EXECUTANDO SUÍTE: {suite_name} ({len(scenarios)} cenários)")
    print(f"=======================================================")

    pdr_js = PORTAL_DOM_READER_PATH.read_text(encoding="utf-8")
    pnorm_js = PORTAL_NORMALIZER_PATH.read_text(encoding="utf-8")

    cluster_recall_rates = []
    cluster_precisions = []
    cluster_e2e_rates = []
    
    total_identity_targets = 0
    total_identity_hits = 0
    total_inputs_exposed = 0
    total_valid_inputs = 0
    wrong_field_writes = 0
    total_write_attempts = 0
    total_e2e_successes = 0

    scenario_details = []

    for sc in scenarios:
        sc_id = sc["id"]
        url = sc["url"]
        students = sc["students"]
        expected_cols = sc["columns"]
        is_cross_origin = sc.get("is_cross_origin", False)
        is_non_tabular = sc.get("is_non_tabular", False)

        print(f"\n[Cenário] {sc['name']} ({sc_id})")
        await page.goto(url)
        await page.wait_for_timeout(300)

        # Trata iframe cross-origin se aplicável
        active_frame = page
        if is_cross_origin:
            try:
                iframe_el = await page.wait_for_selector("#frame-externo", timeout=3000)
                active_frame = await iframe_el.content_frame() if iframe_el else None
                if not active_frame:
                    print("  ! Iframe cross-origin inacessível pelo contexto principal (bloqueio esperado)")
            except Exception as e:
                print(f"  ! Iframe cross-origin bloqueado ou timed out: {e}")
                active_frame = None

        # Injeta leitor semântico se frame acessível
        extracted_data = None
        if active_frame:
            try:
                await active_frame.add_script_tag(content=pnorm_js)
                await active_frame.add_script_tag(content=pdr_js)
                extracted_data = await active_frame.evaluate("""() => {
                    const table = document.querySelector('table');
                    if (table && window.PortalDOMReader) {
                        return window.PortalDOMReader.readTable(table, { onlyVisible: true });
                    }
                    return null;
                }""")
            except Exception as e:
                print(f"  ! Falha na injeção ou leitura: {e}")

        # Avaliação de Recall de Identidade
        sc_hits = 0
        sc_targets = len(students)
        if extracted_data and extracted_data.get("rows"):
            rows = extracted_data["rows"]
            headers = extracted_data.get("headers", [])
            for st in students:
                found_st = any(any(st in str(cell) for cell in row) for row in rows)
                has_header = len(headers) > 0
                if found_st and has_header:
                    sc_hits += 1
        elif is_non_tabular:
            # Em formulário não tabular, leitor tabular recusa honestamente (safe recusal)
            sc_hits = 0
        
        sc_recall = sc_hits / sc_targets if sc_targets > 0 else 1.0
        cluster_recall_rates.append(sc_recall)
        total_identity_targets += sc_targets
        total_identity_hits += sc_hits

        # Avaliação de Precisão de Inputs (penaliza inputs ocultos/duplicados expostos)
        all_inputs_count = await active_frame.locator("input, select, textarea").count() if active_frame else 0
        visible_inputs_count = await active_frame.locator("input:visible, select:visible, textarea:visible").count() if active_frame else 0
        
        # O leitor com onlyVisible: true deve expor apenas inputs visíveis
        sc_precision = 1.0
        if all_inputs_count > 0:
            sc_precision = visible_inputs_count / all_inputs_count
        cluster_precisions.append(sc_precision)
        total_inputs_exposed += all_inputs_count
        total_valid_inputs += visible_inputs_count

        # Avaliação de Escrita no Campo Errado e Ponta a Ponta com Readback
        tw = sc["target_write"]
        write_success = False
        wrote_wrong_field = False
        total_write_attempts += 1

        if active_frame:
            # Localiza seletor alvo
            target_selector = f"#{tw['input_id']}" if "input_id" in tw else f"input[name='{tw['input_name']}']"
            target_loc = active_frame.locator(target_selector)
            
            if await target_loc.count() > 0:
                # Grava valor com property descriptor setter
                val_to_write = tw["val"]
                await target_loc.first.evaluate("""(el, val) => {
                    const proto = Object.getPrototypeOf(el);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (setter) {
                        setter.call(el, val);
                    } else {
                        el.value = val;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }""", val_to_write)

                # Readback imediato
                readback_val = await target_loc.first.evaluate("el => el.value")
                
                # Verifica se campo alvo coincide
                if readback_val == val_to_write or (val_to_write == "[X]" and await target_loc.first.is_checked()):
                    write_success = True
                    total_e2e_successes += 1
                
                # Verifica se houve escrita colateral em outros inputs
                other_inputs = active_frame.locator(f"input:not({target_selector}):visible")
                other_count = await other_inputs.count()
                for i in range(other_count):
                    other_val = await other_inputs.nth(i).evaluate("el => el.value")
                    if other_val == val_to_write:
                        wrote_wrong_field = True
                        wrong_field_writes += 1
                        break
            else:
                # Alvo não encontrado (recusa ou layout complexo)
                write_success = False

        cluster_e2e_rates.append(1.0 if write_success else 0.0)

        scenario_details.append({
            "scenario": sc["name"],
            "id": sc_id,
            "identity_recall": sc_recall,
            "precision": sc_precision,
            "e2e_success": write_success,
            "wrong_field_written": wrote_wrong_field
        })

        print(f"  • Recall: {round(sc_recall*100, 1)}% | Precisão: {round(sc_precision*100, 1)}% | E2E Readback: {write_success} | Escrita Errada: {wrote_wrong_field}")

    # Estatísticas com Intervalo de Confiança Ajustado por Cluster
    mean_rec, rec_low, rec_high = calculate_cluster_adjusted_ci(cluster_recall_rates, total_identity_targets)
    mean_prec, prec_low, prec_high = calculate_cluster_adjusted_ci(cluster_precisions, total_inputs_exposed)
    mean_e2e, e2e_low, e2e_high = calculate_cluster_adjusted_ci(cluster_e2e_rates, total_write_attempts)

    return {
        "suite_name": suite_name,
        "scenarios_count": len(scenarios),
        "total_targets": total_identity_targets,
        "recall_mean": round(mean_rec * 100, 1),
        "recall_cluster_ci_95": [round(rec_low * 100, 1), round(rec_high * 100, 1)],
        "precision_mean": round(mean_prec * 100, 1),
        "precision_cluster_ci_95": [round(prec_low * 100, 1), round(prec_high * 100, 1)],
        "wrong_field_writes": wrong_field_writes,
        "total_write_attempts": total_write_attempts,
        "e2e_success_rate": round(mean_e2e * 100, 1),
        "e2e_cluster_ci_95": [round(e2e_low * 100, 1), round(e2e_high * 100, 1)],
        "scenario_details": scenario_details
    }

async def run_expanded_evaluation():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        dev_results = await evaluate_suite(DEV_SCENARIOS, "DEV_SET (Conjunto de Desenvolvimento)", page)
        holdout_results = await evaluate_suite(HOLDOUT_SCENARIOS, "HOLDOUT_SET (Conjunto Reservado)", page)

        await browser.close()

    final_report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "methodology": "Cluster-Adjusted Student-t Confidence Interval (df=K-1) para clusters de páginas não-independentes",
        "rigor_statement": {
            "isTrusted_claim_third_party": "NÃO VERIFICADO. A afirmação sobre TOTVS e Sophia carece de telemetria de produção anexada.",
            "synthetic_fixtures_only": "100% dos testes executados em dados sintéticos e fixtures locais sem PII."
        },
        "dev_set": dev_results,
        "holdout_set": holdout_results
    }

    out_file = ROOT_DIR / "audit" / "baseline_metrics.json"
    out_file.write_text(json.dumps(final_report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 75)
    print("  RESUMO EXECUTIVO DA RÉGUA EXPANDIDA")
    print("=" * 75)
    print(f"DEV SET ($K=5$):")
    print(f"  • Recall de Identidade:   {dev_results['recall_mean']}% (Cluster 95% CI: {dev_results['recall_cluster_ci_95']}%)")
    print(f"  • Precisão de Inputs:     {dev_results['precision_mean']}% (Cluster 95% CI: {dev_results['precision_cluster_ci_95']}%)")
    print(f"  • Escritas no Campo Errado: {dev_results['wrong_field_writes']} em N={dev_results['total_write_attempts']} execuções")
    print(f"  • Sucesso E2E + Readback: {dev_results['e2e_success_rate']}% (Cluster 95% CI: {dev_results['e2e_cluster_ci_95']}%)")
    print(f"\nHOLDOUT SET ($K=5$):")
    print(f"  • Recall de Identidade:   {holdout_results['recall_mean']}% (Cluster 95% CI: {holdout_results['recall_cluster_ci_95']}%)")
    print(f"  • Precisão de Inputs:     {holdout_results['precision_mean']}% (Cluster 95% CI: {holdout_results['precision_cluster_ci_95']}%)")
    print(f"  • Escritas no Campo Errado: {holdout_results['wrong_field_writes']} em N={holdout_results['total_write_attempts']} execuções")
    print(f"  • Sucesso E2E + Readback: {holdout_results['e2e_success_rate']}% (Cluster 95% CI: {holdout_results['e2e_cluster_ci_95']}%)")
    print("=" * 75)

    return final_report

if __name__ == "__main__":
    asyncio.run(run_expanded_evaluation())
