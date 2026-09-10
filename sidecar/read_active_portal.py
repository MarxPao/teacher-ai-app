"""
read_active_portal.py — Pipeline de Leitura Determinístico & Fallback Robusto (PARTE B)

Implementa a ordem fixa de execução inegociável:
1. RESOLVE: busca PortalConnection.map para o domínio ativo.
2. Se map existe e failures < 3:
   - extract_deterministic(). Zero chamada de LLM.
   - Se sucesso e count >= 1: retorna dados, zera falhas, marca mapped_validated.
   - Se falha pontual (failures < 3): incrementa falhas, NÃO apaga o mapa, NÃO aciona visão.
3. Se não há map, ou map foi invalidado após 3 falhas consecutivas (ou força redescoberta):
   - status = 'discovering'. Roda descoberta por visão (Set-of-Mark).
   - Retry com backoff exponencial com jitter para erro HTTP 429 (mínimo 3 retries).
   - Pós-descoberta determinística imediata: executa extract_deterministic() contra o DOM real
     usando o seletor recém-descoberto para confirmar >= 1 aluno. Só salva como mapped_untested
     e retorna se passar nesse gate.
4. Log estruturado em JSON para cada etapa com layer_used estrito.
"""

import asyncio
import datetime
import json
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

# Força UTF-8 no Windows para evitar artefatos de encoding em acentuação
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Adiciona o diretório do sidecar ao sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

# Carrega variáveis de ambiente do .env.local se existirem
env_path = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

from cdp_connector import CDPConnector
from page_reader_engine import PageReaderEngine
from portal_map_store import PortalMapStore, FAILURE_THRESHOLD


def log_event(
    log_collector: List[Dict[str, Any]],
    step: str,
    layer_used: str,
    details: Dict[str, Any]
) -> None:
    """Registra evento estruturado e emite linha correspondente no stderr."""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    entry = {
        "timestamp": now_iso,
        "step": step,
        "layer_used": layer_used,
        **details
    }
    log_collector.append(entry)
    sys.stderr.write(f"[read_active_portal] [{step.upper()}] layer={layer_used}: {json.dumps(details, ensure_ascii=False)}\n")
    sys.stderr.flush()


def extract_host(url_or_hint: str) -> str:
    """Extrai o hostname de uma URL ou string de hint."""
    if not url_or_hint:
        return ""
    val = url_or_hint.strip().lower()
    if "://" not in val:
        val = "http://" + val
    try:
        parsed = urlparse(val)
        return parsed.hostname or ""
    except Exception:
        return url_or_hint.strip().lower().split("/")[0].split(":")[0]


def check_domain_match(expected_hint: str, actual_page_url: str) -> Tuple[bool, str, str, str]:
    """
    Compara o domínio esperado (de expected_hint / portal_url) com o domínio da aba ativa.
    Retorna (is_match, expected_domain, actual_domain, error_message).
    """
    if not expected_hint or not expected_hint.strip():
        return True, "", "", ""

    expected_host = extract_host(expected_hint)
    actual_host = extract_host(actual_page_url)

    norm_exp = expected_host.removeprefix("www.").strip() if expected_host else expected_hint.strip().lower()
    norm_act = actual_host.removeprefix("www.").strip() if actual_host else actual_page_url.strip().lower()

    if "." in norm_exp and " " not in norm_exp:
        is_match = (norm_exp == norm_act)
    else:
        kw_clean = re.sub(r"[^a-z0-9]", "", norm_exp)
        act_clean = re.sub(r"[^a-z0-9]", "", norm_act)
        is_match = (kw_clean in act_clean) if len(kw_clean) >= 3 else (norm_exp == norm_act)

    if is_match:
        return True, expected_host or norm_exp, actual_host or norm_act, ""

    err_msg = (
        f"A aba aberta no navegador ({actual_page_url}) não corresponde ao portal esperado ({expected_hint}). "
        f"Abra a página correta antes de ler."
    )
    return False, expected_host or norm_exp, actual_host or norm_act, err_msg


async def execute_reading_pipeline(
    page: Any,
    page_hint: str = "",
    goal: str = "lista de alunos na seção Meus Alunos ou chamada da turma",
    output_format: str = "students",
    force_discovery: bool = False,
    map_store: Optional[PortalMapStore] = None,
    engine: Optional[PageReaderEngine] = None,
    structured_log: Optional[List[Dict[str, Any]]] = None,
    connector: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Executa a validação de domínio e o pipeline de leitura da Parte B em cima de uma página.
    Se houver divergência de domínio entre page_hint e a aba ativa, aborta imediatamente
    com status 'domain_mismatch' e 0 alunos, sem chamar Camada 1 ou Camada 2.
    """
    if structured_log is None:
        structured_log = []

    page_url = getattr(page, "url", "")
    page_title = await page.title()

    # ------------------------------------------------------------------
    # GUARDA CRÍTICA (BUG 1): Validação de correspondência entre a aba ativa e o portal esperado.
    # Aborta imediatamente antes de chamar Camada 1 ou Camada 2 caso a aba não bata com o portal.
    # ------------------------------------------------------------------
    if page_hint:
        is_match, exp_dom, act_dom, mismatch_err = check_domain_match(page_hint, page_url)
        if not is_match:
            log_event(
                structured_log,
                "domain_mismatch_abort",
                "none",
                {
                    "expected_hint": page_hint,
                    "expected_domain": exp_dom,
                    "actual_url": page_url,
                    "actual_domain": act_dom,
                    "error": mismatch_err,
                },
            )
            return {
                "success": False,
                "error": mismatch_err,
                "status": "domain_mismatch",
                "page_title": page_title,
                "page_url": page_url,
                "students": [],
                "total": 0,
                "structured_log": structured_log
            }

    domain = PortalMapStore.extract_domain(page_url)
    if map_store is None:
        cache_path = os.path.join(SCRIPT_DIR, "discovered_maps_cache.json")
        map_store = PortalMapStore(supabase_client=None, storage_path=cache_path)
    if engine is None:
        engine = PageReaderEngine()

    saved_map = map_store.lookup_map(domain)
    map_exists = saved_map is not None
    failures = saved_map.validation_failures if saved_map else 0

    if map_exists and failures < FAILURE_THRESHOLD and not force_discovery:
        sel = (
            saved_map.discovered_selectors.get("roster_table")
            or saved_map.discovered_selectors.get("selector")
            or "table"
        )
        strategy = (
            saved_map.discovered_selectors.get("strategy")
            or ("table_rows" if "roster_table" in saved_map.discovered_selectors else "card_grid")
        )
        extracted_c1 = await engine.extract_deterministic(page, sel, strategy=strategy, output_format=output_format)
        if extracted_c1.success and len(extracted_c1.data) > 0:
            return {
                "success": True,
                "students": extracted_c1.data,
                "total": len(extracted_c1.data),
                "layer_used": "layer_1_deterministic",
                "map_source": "known_map",
                "status": "mapped_validated",
                "page_title": page_title,
                "page_url": page_url,
                "structured_log": structured_log
            }

    return {
        "success": False,
        "error": "Pipeline concluído sem extração determinística.",
        "students": [],
        "total": 0,
        "structured_log": structured_log
    }


async def main():
    goal = sys.argv[1] if len(sys.argv) > 1 else "lista de alunos na seção Meus Alunos ou chamada da turma"
    page_hint = sys.argv[2] if len(sys.argv) > 2 else ""
    output_format = sys.argv[3] if len(sys.argv) > 3 else "students"
    force_discovery = (sys.argv[4].lower() in ("true", "1", "force", "--force")) if len(sys.argv) > 4 else False

    structured_log: List[Dict[str, Any]] = []

    connector = CDPConnector("http://localhost:9222")
    is_healthy, health_msg = connector.check_health()
    if not is_healthy:
        err_msg = "O navegador dedicado do Teacher AI não está conectado na porta 9222. Clique em 'Preparar Navegador' no app."
        log_event(structured_log, "cdp_connect", "none", {"status": "error", "message": err_msg})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "structured_log": structured_log
        }))
        return

    try:
        context = await connector.connect()
    except Exception as e:
        err_msg = f"Falha ao conectar via CDP: {e}"
        log_event(structured_log, "cdp_connect", "none", {"status": "error", "message": err_msg})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "structured_log": structured_log
        }))
        return

    if not context or not context.pages:
        err_msg = "Nenhuma aba encontrada aberta no navegador."
        log_event(structured_log, "cdp_find_page", "none", {"status": "error", "message": err_msg})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "structured_log": structured_log
        }))
        return

    # Localiza a aba correta
    page = None
    if page_hint:
        page = await connector.find_portal_page(page_hint)

    if not page:
        for p in context.pages:
            url = p.url.lower()
            if not url.startswith("chrome://") and not url.startswith("chrome-extension://"):
                page = p
                break

    if not page:
        page = context.pages[0]

    page_url = page.url
    page_title = await page.title()

    # ------------------------------------------------------------------
    # GUARDA CRÍTICA (BUG 1): Validação de correspondência entre a aba ativa e o portal esperado.
    # Aborta imediatamente antes de chamar Camada 1 ou Camada 2 caso a aba não bata com o portal.
    # ------------------------------------------------------------------
    if page_hint:
        is_match, exp_dom, act_dom, mismatch_err = check_domain_match(page_hint, page_url)
        if not is_match:
            log_event(
                structured_log,
                "domain_mismatch_abort",
                "none",
                {
                    "expected_hint": page_hint,
                    "expected_domain": exp_dom,
                    "actual_url": page_url,
                    "actual_domain": act_dom,
                    "error": mismatch_err,
                },
            )
            await connector.close()
            print(json.dumps({
                "success": False,
                "error": mismatch_err,
                "status": "domain_mismatch",
                "page_title": page_title,
                "page_url": page_url,
                "students": [],
                "total": 0,
                "structured_log": structured_log
            }, ensure_ascii=False))
            return

    # Detecta desafios de segurança
    is_blocked, challenge = await connector.detect_security_challenge(page)
    if is_blocked:
        err_msg = challenge if ("janela" in challenge.lower() or "sessão" in challenge.lower()) else f"Acesso bloqueado no portal: {challenge}. Faça login na janela do navegador."
        log_event(structured_log, "security_challenge", "none", {"blocked": True, "challenge": challenge})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "page_title": page_title,
            "page_url": page_url,
            "students": [],
            "structured_log": structured_log
        }, ensure_ascii=False))
        return

    domain = PortalMapStore.extract_domain(page_url)
    cache_path = os.path.join(SCRIPT_DIR, "discovered_maps_cache.json")
    map_store = PortalMapStore(supabase_client=None, storage_path=cache_path)
    engine = PageReaderEngine()

    # ------------------------------------------------------------------
    # ETAPA 1: RESOLVE — Busca PortalConnection.map para o domínio
    # ------------------------------------------------------------------
    saved_map = map_store.lookup_map(domain)
    map_exists = saved_map is not None
    failures = saved_map.validation_failures if saved_map else 0

    # Se o portal acumulou >= 3 falhas e o professor NÃO acionou redescoberta manual explicitamente,
    # HALT: não dispara visão automaticamente; exige clique manual conforme Parte A.
    if map_exists and failures >= FAILURE_THRESHOLD and not force_discovery:
        err_msg = (
            f"O portal acumulou {failures} falhas consecutivas de leitura determinística e está no estado "
            f"'broken_needs_rediscovery'. Ação manual requerida: certifique-se de que a lista de alunos "
            f"está aberta no navegador dedicado e clique em 'Redescobrir' para remapear o layout."
        )
        log_event(structured_log, "resolve_map", "none", {
            "domain": domain,
            "map_found": True,
            "validation_failures": failures,
            "threshold": FAILURE_THRESHOLD,
            "route_chosen": "halt_broken_needs_rediscovery",
            "status": "broken_needs_rediscovery",
            "requires_manual_rediscovery": True
        })
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "total": 0,
            "layer_used": "layer_1_deterministic",
            "map_source": "known_map",
            "validation_failures": failures,
            "status": "broken_needs_rediscovery",
            "requires_manual_rediscovery": True,
            "page_title": page_title,
            "page_url": page_url,
            "structured_log": structured_log
        }))
        return

    map_is_valid = map_exists and (failures < FAILURE_THRESHOLD) and not force_discovery

    log_event(structured_log, "resolve_map", "none", {
        "domain": domain,
        "map_found": map_exists,
        "validation_failures": failures,
        "threshold": FAILURE_THRESHOLD,
        "force_discovery": force_discovery,
        "route_chosen": "layer_1_deterministic" if map_is_valid else "layer_2_vision"
    })

    # ------------------------------------------------------------------
    # ETAPA 2: CAMADA 1 — Extração Determinística Direta (Zero LLM)
    # ------------------------------------------------------------------
    if map_is_valid and saved_map:
        sel = (
            saved_map.discovered_selectors.get("roster_table")
            or saved_map.discovered_selectors.get("selector")
            or "table"
        )
        strategy = (
            saved_map.discovered_selectors.get("strategy")
            or ("table_rows" if "roster_table" in saved_map.discovered_selectors else "card_grid")
        )

        log_event(structured_log, "deterministic_extraction_start", "layer_1_deterministic", {
            "selector": sel,
            "strategy": strategy,
            "confidence": saved_map.discovery_confidence
        })

        try:
            pagination_cfg = saved_map.pagination_strategy
            extracted_c1 = await engine.extract_deterministic(
                page, sel, strategy=strategy, output_format=output_format, pagination_config=pagination_cfg
            )
            if extracted_c1.success and len(extracted_c1.data) > 0:
                map_store.mark_validated(domain)
                log_event(structured_log, "deterministic_extraction_success", "layer_1_deterministic", {
                    "students_count": len(extracted_c1.data),
                    "pages_read": extracted_c1.pages_read,
                    "selector": sel,
                    "strategy": strategy,
                    "validation_failures": 0
                })

                print(json.dumps({
                    "success": True,
                    "students": extracted_c1.data,
                    "total": len(extracted_c1.data),
                    "pages_read": extracted_c1.pages_read,
                    "layer_used": "layer_1_deterministic",
                    "map_source": "known_map",
                    "status": "mapped_validated",
                    "page_title": extracted_c1.page_title or page_title,
                    "page_url": extracted_c1.page_url or page_url,
                    "section_used": extracted_c1.section_used,
                    "structured_log": structured_log,
                    "failure_reason": None,
                    "error": None
                }))
                return
            else:
                # Falha ou 0 alunos na extração determinística
                new_failures = map_store.increment_failures(domain)
                fail_reason = extracted_c1.failure_reason or "0 alunos encontrados com seletor conhecido"
                log_event(structured_log, "deterministic_extraction_failure", "layer_1_deterministic", {
                    "reason": fail_reason,
                    "validation_failures": new_failures,
                    "threshold": FAILURE_THRESHOLD
                })

                # REGRA INEGOCIÁVEL (PARTE B & PARTE A):
                # Falha pontual (< 3): preserva mapa, PROIBIDO acionar visão.
                # 3ª falha consecutiva (>= 3): transita para 'broken_needs_rediscovery' e EXIGE ação manual da professora.
                if new_failures < FAILURE_THRESHOLD:
                    log_event(structured_log, "deterministic_transient_failure", "layer_1_deterministic", {
                        "message": f"Falha pontual ({new_failures}/{FAILURE_THRESHOLD}). Mapa preservado. Proibido acionar visão.",
                        "validation_failures": new_failures
                    })
                    print(json.dumps({
                        "success": False,
                        "error": f"Falha pontual na leitura determinística do portal ({fail_reason}). Tentativa {new_failures}/{FAILURE_THRESHOLD}. O mapa foi preservado. Certifique-se de que a lista de alunos está visível na tela.",
                        "students": [],
                        "total": 0,
                        "layer_used": "layer_1_deterministic",
                        "map_source": "known_map",
                        "validation_failures": new_failures,
                        "status": "mapped_untested",
                        "page_title": extracted_c1.page_title or page_title,
                        "page_url": extracted_c1.page_url or page_url,
                        "structured_log": structured_log
                    }))
                    return
                else:
                    log_event(structured_log, "map_invalidated", "layer_1_deterministic", {
                        "message": f"Limiar de {FAILURE_THRESHOLD} falhas consecutivas atingido. Status transita para 'broken_needs_rediscovery'.",
                        "transition": "broken_needs_rediscovery",
                        "requires_manual_rediscovery": True
                    })
                    print(json.dumps({
                        "success": False,
                        "error": (
                            f"O portal atingiu o limite de {FAILURE_THRESHOLD} falhas consecutivas de leitura determinística ({fail_reason}). "
                            f"O status transitou para 'broken_needs_rediscovery'. Por favor, abra a lista de alunos no navegador e clique em 'Redescobrir' para reconfigurar."
                        ),
                        "students": [],
                        "total": 0,
                        "layer_used": "layer_1_deterministic",
                        "map_source": "known_map",
                        "validation_failures": new_failures,
                        "status": "broken_needs_rediscovery",
                        "requires_manual_rediscovery": True,
                        "page_title": extracted_c1.page_title or page_title,
                        "page_url": extracted_c1.page_url or page_url,
                        "structured_log": structured_log
                    }))
                    return
        except Exception as e:
            new_failures = map_store.increment_failures(domain)
            log_event(structured_log, "deterministic_extraction_exception", "layer_1_deterministic", {
                "error": str(e),
                "validation_failures": new_failures,
                "threshold": FAILURE_THRESHOLD
            })
            if new_failures < FAILURE_THRESHOLD:
                print(json.dumps({
                    "success": False,
                    "error": f"Erro pontual na leitura determinística ({e}). Falha {new_failures}/{FAILURE_THRESHOLD} registrada.",
                    "students": [],
                    "total": 0,
                    "layer_used": "layer_1_deterministic",
                    "map_source": "known_map",
                    "validation_failures": new_failures,
                    "status": "mapped_untested",
                    "structured_log": structured_log
                }))
                return
            else:
                log_event(structured_log, "map_invalidated", "layer_1_deterministic", {
                    "message": f"Limiar de {FAILURE_THRESHOLD} falhas consecutivas atingido por exceção ({e}). Status transita para 'broken_needs_rediscovery'.",
                    "transition": "broken_needs_rediscovery",
                    "requires_manual_rediscovery": True
                })
                print(json.dumps({
                    "success": False,
                    "error": (
                        f"O portal atingiu {FAILURE_THRESHOLD} falhas consecutivas ({e}) e transitou para 'broken_needs_rediscovery'. "
                        f"Clique em 'Redescobrir' para reconfigurar."
                    ),
                    "students": [],
                    "total": 0,
                    "layer_used": "layer_1_deterministic",
                    "map_source": "known_map",
                    "validation_failures": new_failures,
                    "status": "broken_needs_rediscovery",
                    "requires_manual_rediscovery": True,
                    "structured_log": structured_log
                }))
                return

    # ------------------------------------------------------------------
    # ETAPA 3: CAMADA 2 — Descoberta por Visão (Set-of-Mark) + Retry 429
    # ------------------------------------------------------------------
    reason_for_c2 = "force_discovery" if force_discovery else ("no_map" if not map_exists else "consecutive_failures_exceeded")
    log_event(structured_log, "vision_discovery_start", "layer_2_vision", {
        "domain": domain,
        "trigger_reason": reason_for_c2,
        "status_transition": "discovering"
    })

    # Prepara chaves BYOK
    byok = {}
    for env_k, prov, model in [
        ("GEMINI_API_KEY", "gemini", "gemini-flash-latest"),
        ("OPENAI_API_KEY", "openai", "gpt-4o"),
        ("GROQ_API_KEY", "groq", "llama-3.3-70b-versatile"),
    ]:
        val = os.getenv(env_k)
        if val:
            byok = {"provider": prov, "model": model, "api_key": val}
            break

    if not byok:
        err_msg = "Nenhuma chave de API (BYOK) configurada no ambiente para executar a Camada 2 (Visão). Configure GEMINI_API_KEY, OPENAI_API_KEY ou GROQ_API_KEY."
        log_event(structured_log, "vision_discovery_error", "layer_2_vision", {"error": err_msg})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "layer_used": "layer_2_vision",
            "structured_log": structured_log
        }))
        return

    try:
        # Executa PageReaderEngine com retry automático de 429 incorporado
        extracted = await engine.run(page, goal, byok, output_format=output_format)

        if not extracted.success or not extracted.section_used:
            err_msg = extracted.failure_reason or "O modelo de visão não identificou a seção de alunos nesta página."
            log_event(structured_log, "vision_discovery_failed", extracted.layer_used or "layer_2_vision", {
                "reason": err_msg
            })
            print(json.dumps({
                "success": False,
                "error": err_msg,
                "students": [],
                "layer_used": extracted.layer_used or "layer_2_vision",
                "map_source": "discovered",
                "page_title": extracted.page_title or page_title,
                "page_url": extracted.page_url or page_url,
                "structured_log": structured_log
            }))
            return

        # ------------------------------------------------------------------
        # ETAPA 3b: VERIFICAÇÃO DETERMINÍSTICA IMEDIATA NO DOM (GATE OBRIGATÓRIO)
        # Ao suceder a visão, NÃO retorna direto para a professora — executa
        # extract_deterministic imediatamente usando o mapa recém-descoberto
        # para confirmar que o determinístico extrai dados reais (>= 1 aluno).
        # ------------------------------------------------------------------
        inferred_selector = extracted.section_used or "table"
        inferred_strategy = extracted.strategy_used or "table_rows"

        log_event(structured_log, "immediate_dom_verification_start", "layer_2_vision", {
            "inferred_selector": inferred_selector,
            "inferred_strategy": inferred_strategy
        })

        immediate_check = await engine.extract_deterministic(
            page, inferred_selector, strategy=inferred_strategy, output_format=output_format
        )

        if not immediate_check.success or len(immediate_check.data) < 1:
            # GATE REJEITADO: o seletor inferido pela visão não extrai dados reais no DOM
            err_msg = (
                f"Validação determinística imediata falhou: o seletor inferido pela visão ('{inferred_selector}') "
                f"encontrou 0 registros no DOM real. O mapa foi rejeitado para evitar dados inconsistentes."
            )
            log_event(structured_log, "immediate_dom_verification_rejected", "layer_2_vision", {
                "inferred_selector": inferred_selector,
                "students_found": len(immediate_check.data),
                "passed": False,
                "action": "map_rejected"
            })
            print(json.dumps({
                "success": False,
                "error": err_msg,
                "students": [],
                "total": 0,
                "layer_used": "layer_2_vision",
                "map_source": "discovered",
                "immediate_verification_passed": False,
                "page_title": immediate_check.page_title or page_title,
                "page_url": immediate_check.page_url or page_url,
                "structured_log": structured_log
            }))
            return

        # GATE APROVADO: o seletor extraiu dados reais no DOM
        log_event(structured_log, "immediate_dom_verification_passed", "layer_2_vision", {
            "inferred_selector": inferred_selector,
            "inferred_strategy": inferred_strategy,
            "students_verified": len(immediate_check.data),
            "passed": True
        })

        # Salva o mapa verificado no store como mapped_untested
        discovered_selectors = {
            "roster_table": inferred_selector,
            "strategy": inferred_strategy,
            "header_rows": 1
        }

        try:
            map_store.save_map(
                domain=domain,
                display_name=immediate_check.page_title or page_title,
                selectors=discovered_selectors,
                pagination=None,
                confidence="high",
                teacher_id=None
            )
            log_event(structured_log, "save_discovered_map", "layer_2_vision", {
                "domain": domain,
                "status": "mapped_untested",
                "selectors": discovered_selectors
            })
        except Exception as save_err:
            log_event(structured_log, "save_discovered_map_warning", "layer_2_vision", {
                "warning": str(save_err)
            })

        print(json.dumps({
            "success": True,
            "students": immediate_check.data,
            "total": len(immediate_check.data),
            "layer_used": "layer_2_vision",
            "map_source": "discovered",
            "status": "mapped_untested",
            "discovered_map": {
                "selector_strategy": inferred_strategy,
                "semantic_role": "roster",
                "confidence": "high",
                "validation_failures": 0,
                "selectors": discovered_selectors,
                "pagination": None
            },
            "immediate_verification_passed": True,
            "page_title": immediate_check.page_title or page_title,
            "page_url": immediate_check.page_url or page_url,
            "section_used": inferred_selector,
            "structured_log": structured_log,
            "failure_reason": None,
            "error": None
        }))

    except Exception as e:
        err_msg = f"Erro durante o ciclo de descoberta visual: {e}"
        log_event(structured_log, "vision_discovery_exception", "layer_2_vision", {"error": str(e)})
        print(json.dumps({
            "success": False,
            "error": err_msg,
            "students": [],
            "layer_used": "layer_2_vision",
            "structured_log": structured_log
        }))


if __name__ == "__main__":
    asyncio.run(main())
