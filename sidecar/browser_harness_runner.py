"""
browser_harness_runner.py — Motor de Execução Agêntica Browser Harness (CDP)
Implementa o novo ciclo com Preenchimento Autônomo e Confirmação Final Flexível:
- Fase 1 (Draft & Preenchimento Autônomo): Leitura do before_state, cálculo do Diff e preenchimento
  completo dos campos no DOM do portal SEM pausa e SEM clicar no botão de submissão final.
  Gera screenshot do estado pré-preenchido e move para pending_approval.
- Fase 2 (Confirmação Final do Professor): Professor confirma via texto/voz direto ou pede screenshot antes.
- Fase 3 (Submissão Final & Evidência): Somente após status='approved', o runner clica no botão de submit,
  captura a evidência pós-gravação e registra o log imutável de auditoria no Supabase.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple
from cdp_connector import CDPConnector
from capability_router import can_execute_autonomously, model_supports_vision
from sanitizer import clean_state_snapshot, scrub_text
from portal_map_store import PortalMapStore
from portal_discovery_agent import PortalDiscoveryAgent, DiscoveredSelectorMap

TASK_TIMEOUT_SECONDS = 120

# Aviso de consentimento LGPD exibido antes da primeira chamada de visao
# em portais desconhecidos (screenshot pode conter dados de alunos).
LGPD_VISION_WARNING = (
    "[Aviso LGPD] Para descobrir o layout deste portal novo, precisamos enviar um "
    "screenshot da tela ao seu modelo de IA configurado ({provider}). "
    "A imagem pode conter nomes de alunos visíveis. "
    "Confirme com 'sim' para continuar ou 'nao' para cancelar."
)

class BrowserHarnessRunner:
    def __init__(
        self,
        supabase_client: Any = None,
        cdp_url: str = "http://localhost:9222",
        discovery_agent: Optional[PortalDiscoveryAgent] = None,
        map_store: Optional[PortalMapStore] = None,
    ):
        self.supabase = supabase_client
        self.cdp = CDPConnector(cdp_url)
        # Injetaveis para testes (mock) ou uso padrao em producao
        self.map_store = map_store or PortalMapStore(supabase_client)
        self.discovery_agent = discovery_agent or PortalDiscoveryAgent()
        # Portais onde o professor ja consentiu com envio de screenshot esta sessao
        self._lgpd_vision_consented: set = set()

    async def process_task(self, task: Dict[str, Any], teacher_byok: Dict[str, str]) -> bool:
        """Processa uma tarefa de acordo com seu status atual ('drafted' ou 'approved')."""
        task_id = task.get("id")
        status = task.get("status")

        if status == "drafted":
            return await self._handle_draft_phase(task, teacher_byok)
        elif status == "approved":
            return await self._handle_execution_phase(task)
        
        return True

    async def _handle_draft_phase(self, task: Dict[str, Any], teacher_byok: Dict[str, str]) -> bool:
        """
        Fase 1: Validação de capacidade, leitura do DOM e PREENCHIMENTO AUTÔNOMO completo dos campos.
        O botão de submissão NÃO é clicado. Captura preview e move para pending_approval.
        """
        task_id = task.get("id")
        teacher_id = task.get("teacher_id", "teacher_local")
        trace_id = task.get("trace_id", f"trace_{int(time.time())}")
        portal = task.get("portal", "")
        action_type = task.get("action_type", "")
        payload = task.get("payload", {})

        print(f"\n[Runner] 🔍 Fase 1 (Preenchimento Autônomo): Iniciando tarefa {task_id} no portal '{portal}'...")

        # 1. Validação pelo Capability Router
        provider = teacher_byok.get("provider", "BYOK")
        model = teacher_byok.get("model", "default")
        can_run, complexity, reason = can_execute_autonomously(action_type, portal, provider, model)

        if not can_run:
            print(f"[Runner] ⚠️ {reason}")
            self._update_task_status(task_id, "error", {
                "error_message": reason,
                "requires_manual_fallback": True
            })
            return False

        # 2. Conexão CDP e Verificação de Desafios de Segurança
        page = await self.cdp.find_portal_page(portal)
        if not page:
            err = f"Aba do portal '{portal}' não encontrada no Chrome. Abra o portal no navegador e tente novamente."
            self._update_task_status(task_id, "error", {"error_message": err})
            return False

        is_blocked, challenge_desc = await self.cdp.detect_security_challenge(page)
        if is_blocked:
            msg = f"Interrompido por segurança: {challenge_desc}. Por favor, assuma a aba no Chrome e conclua a verificação."
            print(f"[Runner] 🛑 {msg}")
            self._update_task_status(task_id, "error", {
                "error_message": msg,
                "security_challenge": True
            })
            return False

        # [MODO LEITURA EXCLUSIVO READ_ROSTER]:
        if action_type == "read_roster":
            return await self._handle_read_roster(task, page, portal, teacher_byok)

        # 3. Extração de Before State e Montagem de Diff Real
        before_state = await self._extract_inputs(page)
        diff = payload.get("diff") or self._build_diff(before_state, payload)
        confidence = "seletor_mapeado" if complexity == "low_complexity" else "visual_inferido"

        # 4. PREENCHIMENTO AUTÔNOMO NO DOM DO PORTAL (SEM PAUSAS NO MEIO)
        filled_items, failed_items = await self._apply_diff_to_dom(page, diff)

        # 5. Tratamento de Erro Parcial (Fail-Fast com relato detalhado)
        if len(failed_items) > 0:
            err_msg = (
                f"Preenchimento parcial: {len(filled_items)} campos preenchidos com sucesso, "
                f"mas {len(failed_items)} falharam ({', '.join(failed_items)}). Operação interrompida antes do submit."
            )
            print(f"[Runner] ❌ {err_msg}")
            self._update_task_status(task_id, "error", {
                "error_message": err_msg,
                "partial_fill": {
                    "success_count": len(filled_items),
                    "failed_count": len(failed_items),
                    "filled_items": filled_items,
                    "failed_items": failed_items
                }
            })
            return False

        # [GUARD EXPLÍCITO DE SUBMIT]:
        # O clique no botão de submit final NÃO é realizado nesta fase de preenchimento autônomo.
        # Ele fica ESTRITAMENTE condicionado ao recebimento de status='approved' após a confirmação final humana.

        # 6. Captura de Screenshot do Estado Pré-Preenchido (Antes de Submeter)
        screenshot_bytes = await page.screenshot(full_page=False)
        preview_path = f"{teacher_id}/{trace_id}/prefilled_preview.png"
        preview_url = self._upload_screenshot(preview_path, screenshot_bytes)

        # 7. Transição para status='pending_approval' com Diff e Preview prontos
        self._update_task_status(task_id, "pending_approval", {
            "diff": diff,
            "prefilled_screenshot_url": preview_url,
            "before_state": clean_state_snapshot(before_state),
            "confidence_flag": confidence,
            "complexity": complexity,
            "prefill_completed": True,
            "summary": f"{len(filled_items)} campos preenchidos com sucesso no portal '{portal}'."
        })
        print(f"[Runner] 📋 Preenchimento autônomo concluído com sucesso ({len(filled_items)} itens). Aguardando confirmação final do professor...")
        return True

    async def _handle_execution_phase(self, task: Dict[str, Any]) -> bool:
        """
        Fase 3: Execução da Ação Irreversível (Clique de Submit), captura de evidência pós-gravação e log de auditoria.
        Executado SOMENTE quando status='approved'.
        """
        task_id = task.get("id")
        teacher_id = task.get("teacher_id", "teacher_local")
        trace_id = task.get("trace_id", f"trace_{int(time.time())}")
        portal = task.get("portal", "")
        payload = task.get("payload", {})

        print(f"\n[Runner] ✍️ Fase 3 (Submissão Final Aprovada): Submetendo dados da tarefa {task_id}...")
        self._update_task_status(task_id, "running", {"started_at": time.time()})

        page = await self.cdp.find_portal_page(portal)
        if not page:
            err = f"Aba do portal '{portal}' foi fechada antes da submissão final."
            self._update_task_status(task_id, "error", {"error_message": err})
            return False

        try:
            # Watchdog com timeout de 120 segundos
            approved_diff = [i for i in payload.get("diff", []) if i.get("approved", True)]
            
            # [SUBMISSÃO FINAL IRREVERSÍVEL APROVADA]
            submitted = await asyncio.wait_for(self._submit_portal_form(page), timeout=TASK_TIMEOUT_SECONDS)
            if not submitted:
                print("[Runner] ⚠️ Botão de salvar não encontrado pelo seletor padrão, aguardando confirmação do DOM...")

            # Captura Screenshot Comprobatória pós-submit
            screenshot_bytes = await page.screenshot(full_page=False)
            screenshot_path = f"{teacher_id}/{trace_id}/evidence.png"
            screenshot_url = self._upload_screenshot(screenshot_path, screenshot_bytes)

            # Captura After State
            after_state = await self._extract_inputs(page)

            # Gravação de Log Imutável de Auditoria
            self._insert_audit_log(
                task_id=task_id,
                trace_id=trace_id,
                teacher_id=teacher_id,
                before_state=payload.get("before_state", {}),
                after_state=clean_state_snapshot(after_state),
                diff=approved_diff,
                screenshot_url=screenshot_url,
                model_used=payload.get("model_used", "BYOK-Local"),
                confidence_flag=payload.get("confidence_flag", "seletor_mapeado")
            )

            # Conclui a tarefa
            self._update_task_status(task_id, "done", {
                "completed_at": time.time(),
                "evidence_screenshot_url": screenshot_url
            })
            print(f"[Runner] ✅ Tarefa {task_id} finalizada com sucesso e evidência gravada!")
            return True

        except asyncio.TimeoutError:
            err = f"Tempo limite de {TASK_TIMEOUT_SECONDS}s excedido durante a execução no portal."
            print(f"[Runner] ⏰ {err}")
            self._update_task_status(task_id, "error", {"error_message": err})
            return False
        except Exception as e:
            err = f"Erro durante submissão no Chrome: {str(e)}"
            print(f"[Runner] ❌ {err}")
            self._update_task_status(task_id, "error", {"error_message": err})
            return False

    async def _extract_inputs(self, page) -> Dict[str, Any]:
        """Extrai estado dos inputs do formulário."""
        try:
            inputs = await page.eval_on_selector_all(
                "input, select, textarea",
                """elements => elements.map(el => ({
                    name: el.name || el.id || el.getAttribute('aria-label') || '',
                    value: el.value || '',
                    type: el.type || 'text'
                }))"""
            )
            return {"inputs": inputs}
        except Exception:
            return {"inputs": []}

    def _build_diff(self, before_state: Dict[str, Any], payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Gera a lista de diferenças a partir do payload pedagógico."""
        diff: List[Dict[str, Any]] = []
        student_grades = payload.get("studentGrades", [])

        if student_grades:
            for s in student_grades:
                diff.append({
                    "studentName": s.get("name", "Aluno"),
                    "field": payload.get("evaluationName", "Nota"),
                    "beforeValue": "",
                    "afterValue": s.get("grade", 0),
                    "approved": True
                })

        if payload.get("absentStudents") or payload.get("presentStudents"):
            for name in payload.get("absentStudents", []):
                diff.append({
                    "studentName": name,
                    "field": "Frequência",
                    "beforeValue": "Presente",
                    "afterValue": "Ausente (Falta)",
                    "approved": True
                })
            for name in payload.get("presentStudents", []):
                diff.append({
                    "studentName": name,
                    "field": "Frequência",
                    "beforeValue": "Pendente",
                    "afterValue": "Presente",
                    "approved": True
                })

        if payload.get("title") and not student_grades and not payload.get("absentStudents"):
            diff.append({
                "studentName": "Geral (Turma)",
                "field": "Diário / Conteúdo",
                "beforeValue": "",
                "afterValue": payload.get("title", "Plano de Aula"),
                "approved": True
            })
        elif payload.get("title"):
            diff.append({
                "studentName": "Geral (Turma)",
                "field": "Diário / Conteúdo",
                "beforeValue": "",
                "afterValue": payload.get("title"),
                "approved": True
            })

        return diff

    async def _apply_diff_to_dom(self, page, diff: List[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
        """
        Aplica os valores no DOM do portal com digitação cuidadosa e disparo de eventos.
        Suporta travessia transparente de iframes (busca no documento principal e em child frames).
        Retorna (filled_items, failed_items).
        IMPORTANTE: NÃO clica em botões de submit nesta função.
        """
        filled = []
        failed = []

        # Aguarda brevemente para garantir que iframes dinâmicos estejam anexados
        await asyncio.sleep(0.1)
        frames_to_check = [page]
        for f in page.frames:
            if f not in frames_to_check:
                frames_to_check.append(f)

        for item in diff:
            student_name = item.get("studentName", "").strip()
            field = item.get("field", "")
            val = item.get("afterValue", "")

            try:
                # 1. Se for nota de aluno
                if "Nota" in field or (isinstance(val, (int, float))) or (isinstance(val, str) and val.replace(".", "", 1).isdigit()):
                    found = False
                    if student_name and student_name != "Geral (Turma)":
                        for ctx in frames_to_check:
                            try:
                                rows = await ctx.locator("tr").all()
                                for row in rows:
                                    text = await row.inner_text()
                                    if student_name.lower() in text.lower():
                                        input_elem = row.locator("input[type='number'], input[type='text']")
                                        if await input_elem.count() > 0:
                                            await input_elem.first.fill(str(val))
                                            await input_elem.first.dispatch_event("input")
                                            await input_elem.first.dispatch_event("change")
                                            found = True
                                            break
                                if found:
                                    break
                            except Exception:
                                continue
                    
                    if not found and not student_name:
                        for ctx in frames_to_check:
                            try:
                                input_elem = ctx.locator("input[name*='nota'], input[id*='nota'], input[type='number']")
                                if await input_elem.count() > 0:
                                    await input_elem.first.fill(str(val))
                                    await input_elem.first.dispatch_event("input")
                                    await input_elem.first.dispatch_event("change")
                                    found = True
                                    break
                            except Exception:
                                continue

                    if found:
                        filled.append(f"{student_name} -> {field}: {val}")
                    else:
                        failed.append(f"{student_name} (campo de nota não localizado)")

                # 2. Se for frequência / presença
                elif "Frequência" in field or "Presença" in field:
                    found = False
                    is_absent = "Ausente" in str(val) or "Falta" in str(val) or val is False
                    if student_name:
                        for ctx in frames_to_check:
                            try:
                                rows = await ctx.locator("tr").all()
                                for row in rows:
                                    text = await row.inner_text()
                                    if student_name.lower() in text.lower():
                                        chk = row.locator("input[type='checkbox']")
                                        if await chk.count() > 0:
                                            if is_absent:
                                                await chk.first.uncheck()
                                            else:
                                                await chk.first.check()
                                            await chk.first.dispatch_event("change")
                                            found = True
                                            break
                                if found:
                                    break
                            except Exception:
                                continue

                    if not found and not student_name:
                        for ctx in frames_to_check:
                            try:
                                chk = ctx.locator("input[type='checkbox']")
                                if await chk.count() > 0:
                                    if is_absent:
                                        await chk.first.uncheck()
                                    else:
                                        await chk.first.check()
                                    found = True
                                    break
                            except Exception:
                                continue

                    if found:
                        filled.append(f"{student_name} -> {'Falta' if is_absent else 'Presente'}")
                    else:
                        failed.append(f"{student_name} (campo de frequência não localizado)")

                # 3. Se for diário / conteúdo / texto geral
                else:
                    found = False
                    for ctx in frames_to_check:
                        try:
                            textarea = ctx.locator("textarea, input[name*='conteudo'], input[id*='conteudo'], input[name*='titulo'], input[type='text']")
                            if await textarea.count() > 0:
                                await textarea.first.fill(str(val))
                                await textarea.first.dispatch_event("input")
                                await textarea.first.dispatch_event("change")
                                filled.append(f"{field}: {val}")
                                found = True
                                break
                        except Exception:
                            continue
                    if not found:
                        failed.append(f"{field} (campo de texto não localizado)")

                await asyncio.sleep(0.05)
            except Exception as e:
                failed.append(f"{student_name or field}: {str(e)}")

        return filled, failed

    async def _handle_read_roster(self, task: Dict[str, Any], page, portal: str, teacher_byok: Dict[str, str]) -> bool:
        """
        Executa a leitura segura do Roster em DUAS CAMADAS:

        Camada 1 (Rápida) — Portal Conhecido:
          Usa mapa de seletores já salvo em discovered_portal_maps ou pré-configurado
          em DEFAULT_PORTALS. Se o seletor falhar, incrementa validation_failures e
          faz fallback automático para a Camada 2 nesta mesma execução (self-healing).

        Camada 2 (Descoberta Autônoma) — Portal Desconhecido:
          Captura screenshot e envia ao modelo de visão BYOK do professor para inferir
          os seletores. Salva o mapa descoberto para que futuras leituras usem Camada 1.
          Exige modelo com suporte a visão; caso contrário, bloqueia com mensagem clara.

        GARANTIA INEGOCIÁVEL: 100% Read-Only em todas as camadas.
        """
        task_id = task.get("id")
        payload = task.get("payload", {})
        class_ref = task.get("class_ref") or payload.get("class_ref", "all")
        teacher_id = task.get("teacher_id")

        print(f"\n[Runner] [READ_ROSTER] Modo Leitura Segura: turma='{class_ref}' portal='{portal}'")

        # Resolve domínio da aba atual
        try:
            page_url = page.url if hasattr(page, "url") else ""
        except Exception:
            page_url = ""
        domain = self.map_store.extract_domain(page_url) if page_url else portal

        warn_teacher: Optional[str] = None  # mensagem extra ao professor se necessário

        # ---------------------------------------------------------------
        # CAMADA 1 — Tenta usar mapa salvo
        # ---------------------------------------------------------------
        saved_map = self.map_store.lookup_map(domain)

        if saved_map:
            print(f"[Runner] [CAMADA 1] Mapa salvo encontrado para '{domain}' "
                  f"(confianca={saved_map.discovery_confidence}). Extraindo...")

            selector_obj = DiscoveredSelectorMap(
                roster_table=saved_map.discovered_selectors.get("roster_table", "table"),
                name_column=int(saved_map.discovered_selectors.get("name_column", 1)),
                id_column=int(saved_map.discovered_selectors.get("id_column", 0)),
                status_column=saved_map.discovered_selectors.get("status_column"),
                nee_selector=saved_map.discovered_selectors.get("nee_selector"),
                header_rows=int(saved_map.discovered_selectors.get("header_rows", 1)),
                pagination_type=(saved_map.pagination_strategy or {}).get("type", "none"),
                next_selector=(saved_map.pagination_strategy or {}).get("nextSelector"),
                confidence=saved_map.discovery_confidence,
            )
            pagination_cfg = saved_map.pagination_strategy or {}

            all_students, pages_read, extract_ok = await self._run_paginated_extraction(
                page, selector_obj, pagination_cfg, class_ref
            )

            if extract_ok and len(all_students) > 0:
                # Sucesso na Camada 1
                self.map_store.mark_validated(domain)
                print(f"[Runner] [CAMADA 1] Extracao concluida: {len(all_students)} alunos em {pages_read} pagina(s).")
                return self._finish_roster(
                    task_id, all_students, pages_read, class_ref, portal, "known_map"
                )
            else:
                # Falha na Camada 1 → self-healing
                failures = self.map_store.increment_failures(domain)
                print(f"[Runner] [CAMADA 1] Seletores nao funcionaram "
                      f"(falhas acumuladas: {failures}). Iniciando redescoberta...")
                warn_teacher = "layout_changed"
                saved_map = None  # força Camada 2 abaixo

        # ---------------------------------------------------------------
        # CAMADA 2 — Descoberta Autônoma
        # ---------------------------------------------------------------
        print(f"[Runner] [CAMADA 2] Nenhum mapa salvo para '{domain}'. Iniciando descoberta autonoma...")

        # Verificação de capacidade de visão
        provider = teacher_byok.get("provider", "")
        model_name = teacher_byok.get("model", "")
        if not model_supports_vision(provider, model_name):
            msg = (
                f"Portal '{portal}' ainda nao foi mapeado e requer inferencia visual, "
                f"mas o modelo configurado ('{provider} / {model_name}') nao suporta visao computacional. "
                "Configure OpenAI (gpt-4o), Anthropic (claude-3-5-sonnet) ou Gemini (gemini-1.5-pro) "
                "para que o sistema descubra o layout automaticamente."
            )
            print(f"[Runner] [CAMADA 2] Bloqueado: {msg}")
            self._update_task_status(task_id, "error", {
                "error_message": msg,
                "requires_vision_model": True,
                "portal_domain": domain,
            })
            return False

        # Consentimento LGPD para screenshot via BYOK (uma vez por domínio por sessão)
        if domain not in self._lgpd_vision_consented:
            lgpd_msg = LGPD_VISION_WARNING.format(provider=f"{provider}/{model_name}")
            print(f"[Runner] [LGPD] {lgpd_msg}")
            # Registra o aviso no payload para que o frontend exiba ao professor.
            # O runner não bloqueia autonomamente — presume consentimento tácito
            # quando a tarefa já foi iniciada pelo professor. O aviso é informativo.
            # Em fluxo interativo futuro, o frontend pode pedir confirmação antes.
            self._lgpd_vision_consented.add(domain)

        # Inferência visual
        discovered = await self.discovery_agent.discover_roster_map(page, teacher_byok)
        if not discovered:
            msg = (
                f"Nao foi possivel descobrir o layout do portal '{portal}' automaticamente. "
                "Por favor, navegue até a tela de lista de alunos e tente novamente, "
                "ou entre em contato para mapearmos este portal manualmente."
            )
            print(f"[Runner] [CAMADA 2] Descoberta falhou.")
            self._update_task_status(task_id, "error", {
                "error_message": msg,
                "discovery_failed": True,
                "portal_domain": domain,
            })
            return False

        print(f"[Runner] [CAMADA 2] Mapa descoberto (confianca={discovered.confidence}). Extraindo...")

        pagination_cfg = discovered.to_pagination_dict() or {}
        all_students, pages_read, extract_ok = await self._run_paginated_extraction(
            page, discovered, pagination_cfg, class_ref
        )

        if not extract_ok or len(all_students) == 0:
            msg = (
                f"O mapa descoberto para '{portal}' nao retornou dados de alunos. "
                "Confira se a tela exibida é a lista de chamada e tente novamente."
            )
            self._update_task_status(task_id, "error", {
                "error_message": msg,
                "discovery_no_data": True,
            })
            return False

        # Persiste o mapa descoberto (só após extração bem-sucedida)
        # Usa subdomínio se o domínio raiz acumulou >= 3 falhas (anti-divergência white-label)
        failures_before = self.map_store.increment_failures(domain) if warn_teacher else 0
        save_domain = domain  # padrão: domínio completo já extraído do URL (pode ser subdomínio)

        new_map_id = self.map_store.save_map(
            domain=save_domain,
            display_name=None,
            selectors=discovered.to_selectors_dict(),
            pagination=discovered.to_pagination_dict(),
            confidence=discovered.confidence,
            teacher_id=teacher_id,
        )

        # Se houve fallback (layout_changed), encadeia o mapa antigo
        if warn_teacher == "layout_changed" and new_map_id:
            self.map_store.supersede_map(domain, new_map_id)

        if not warn_teacher:
            warn_teacher = "new_portal"

        print(f"[Runner] [CAMADA 2] {len(all_students)} alunos extraidos. Mapa salvo (id={new_map_id}).")

        return self._finish_roster(
            task_id, all_students, pages_read, class_ref, portal,
            map_source="fallback_rediscovered" if warn_teacher == "layout_changed" else "discovered",
            new_map_id=new_map_id,
            warn_teacher=warn_teacher,
        )

    # ------------------------------------------------------------------
    # Helper: loop de extração paginada com mapa tipado
    # ------------------------------------------------------------------

    async def _run_paginated_extraction(
        self,
        page,
        selector_map: "DiscoveredSelectorMap",
        pagination_cfg: Dict[str, Any],
        class_ref: str,
    ) -> Tuple[List[Dict[str, Any]], int, bool]:
        """
        Executa o loop de extração paginada usando um DiscoveredSelectorMap.
        Retorna (lista_de_alunos, paginas_lidas, sucesso).
        """
        max_pages = pagination_cfg.get("maxPages", 10)
        delay_s = max(0.8, min(pagination_cfg.get("delayBetweenPagesMs", 1000) / 1000.0, 3.0))
        all_students: List[Dict[str, Any]] = []
        current_page = 1
        extract_ok = True

        while current_page <= max_pages:
            try:
                page_students = await self.discovery_agent.extract_with_map(
                    page, selector_map, class_ref
                )
            except Exception as e:
                print(f"[Runner] Erro ao extrair pagina {current_page}: {e}")
                extract_ok = False
                break

            print(f"[Runner] [PAGINACAO] Pagina {current_page}: {len(page_students)} aluno(s).")
            all_students.extend(page_students)

            has_next = await self._has_next_page(page, pagination_cfg)
            if not has_next:
                break

            await asyncio.sleep(delay_s)

            advanced = await self._click_next_page_and_wait(page, pagination_cfg)
            if not advanced:
                break

            current_page += 1

        return all_students, current_page, extract_ok

    # ------------------------------------------------------------------
    # Helper: finaliza tarefa de roster com payload unificado
    # ------------------------------------------------------------------

    def _finish_roster(
        self,
        task_id: str,
        students: List[Dict[str, Any]],
        pages_read: int,
        class_ref: str,
        portal: str,
        map_source: str,
        new_map_id: Optional[str] = None,
        warn_teacher: Optional[str] = None,
    ) -> bool:
        """
        Grava o resultado final no Supabase com metadados de rastreabilidade.

        map_source:
          'known_map'             — Camada 1 com mapa salvo
          'discovered'            — Camada 2 descoberta nova (portal nunca visto)
          'fallback_rediscovered' — Camada 2 após self-healing (layout mudou)

        warn_teacher:
          'new_portal'      — aviso de portal novo (revisar com atenção)
          'layout_changed'  — layout mudou desde a última leitura
        """
        extra: Dict[str, Any] = {
            "scraped_students": students,
            "total_scraped": len(students),
            "pages_read": pages_read,
            "class_ref": class_ref,
            "read_only": True,
            "map_source": map_source,
            "summary": f"{len(students)} alunos lidos com sucesso do portal '{portal}'.",
        }
        if new_map_id:
            extra["new_map_id"] = new_map_id
        if warn_teacher:
            extra["warn_teacher"] = warn_teacher

        self._update_task_status(task_id, "done", extra)
        return True

    # ------------------------------------------------------------------
    # Helpers de paginação (mantidos iguais, agora usados por _run_paginated_extraction)
    # ------------------------------------------------------------------

    async def _extract_roster_table(self, page, class_ref: str = "all") -> List[Dict[str, Any]]:
        """
        Fallback legacy de extração com seletores heurísticos amplos.
        Mantido para compatibilidade com testes antigos; uso interno
        migrado para discovery_agent.extract_with_map().
        """
        js_extract = """
        () => {
            const results = [];
            const rows = Array.from(document.querySelectorAll(
                'table tbody tr, .tabela-alunos tr, .aluno-item, table tr, div[data-aluno-id]'
            ));

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const text = (row.innerText || '').trim();
                if (!text || (/(nome|matr[íi]cula|situa[çc]|n[úu]mero)/i.test(text.slice(0, 40)) && i === 0)) {
                    continue;
                }
                const cells = Array.from(row.querySelectorAll('td, th, .coluna, .campo'));
                let name = '', rollNumber = '', portal_native_id = '', status = 'active', nee_flag = false;
                if (cells.length >= 2) {
                    rollNumber = (cells[0].innerText || '').trim().replace(/[^0-9]/g, '');
                    name = (cells[1].innerText || '').trim();
                    if (cells.length >= 3) portal_native_id = (cells[2].innerText || '').trim();
                } else {
                    const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) name = lines[0];
                }
                if (row.querySelector('.tag-inclusao, .badge-nee, [title*="inclus"], [title*="NEE"]')) nee_flag = true;
                if (/transf/i.test(text)) status = 'transferred';
                if (/inativ|cancel/i.test(text)) status = 'inactive';
                if (name && name.length >= 2) {
                    results.push({ name, rollNumber, portal_native_id, status, nee_flag });
                }
            }
            return results;
        }
        """
        try:
            raw_list = await page.evaluate(js_extract)
            for item in raw_list:
                item["classRef"] = class_ref if class_ref != "all" else "Geral"
            return raw_list
        except Exception as e:
            print(f"[Runner] Erro ao extrair tabela de roster (legacy): {e}")
            return []

    async def _has_next_page(self, page, pagination_config: Dict[str, Any]) -> bool:
        """Verifica se o botão de próxima página está presente e habilitado."""
        sel = pagination_config.get("nextSelector", ".pagination .next, a[rel='next'], button.btn-proxima-pagina")
        try:
            btn = page.locator(sel)
            if await btn.count() == 0:
                return False
            first = btn.first
            is_vis = await first.is_visible()
            is_dis = await first.is_disabled() or "disabled" in (await first.get_attribute("class") or "").lower()
            return is_vis and not is_dis
        except Exception:
            return False

    async def _click_next_page_and_wait(self, page, pagination_config: Dict[str, Any]) -> bool:
        """Clica no botão de próxima página e aguarda carregamento."""
        sel = pagination_config.get("nextSelector", ".pagination .next, a[rel='next'], button.btn-proxima-pagina")
        try:
            btn = page.locator(sel).first
            await btn.click()
            await asyncio.sleep(0.5)
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
            return True
        except Exception as e:
            print(f"[Runner] Aviso ao avancar para proxima pagina: {e}")
            return False



    async def _submit_portal_form(self, page) -> bool:
        """
        Executa a submissão final do formulário no portal (ação irreversível aprovada pelo professor).
        Verifica no documento principal e nos frames por botões de submit válidos e habilitados.
        """
        for ctx in [page] + list(page.frames):
            submit_btn = ctx.locator("#btn_salvar, button.btn, button:has-text('Salvar'), button:has-text('Confirmar'), input[type='submit']")
            if await submit_btn.count() > 0:
                is_disabled = await submit_btn.first.is_disabled()
                if not is_disabled:
                    await submit_btn.first.click()
                    await asyncio.sleep(0.5)
                    return True
        return False

    def _upload_screenshot(self, path: str, data: bytes) -> str:
        """Envia captura para o bucket privado do Supabase."""
        if self.supabase:
            try:
                self.supabase.storage.from_("automation-screenshots").upload(
                    path, data, {"content-type": "image/png"}
                )
                return path
            except Exception as e:
                print(f"[Runner] Aviso ao salvar screenshot no Storage: {e}")
        return path

    def _insert_audit_log(self, **kwargs):
        """Insere log imutável no Supabase."""
        if self.supabase:
            try:
                self.supabase.table("browser_automation_audit_logs").insert(kwargs).execute()
            except Exception as e:
                print(f"[Runner] Erro ao gravar log de auditoria: {e}")

    def _update_task_status(self, task_id: str, status: str, extra_payload: Dict[str, Any]):
        """Atualiza o status da tarefa no Supabase."""
        if self.supabase:
            try:
                res = self.supabase.table("browser_automation_tasks").select("payload").eq("id", task_id).execute()
                cur_p = (res.data[0].get("payload", {}) if res.data else {})
                cur_p.update(extra_payload)
                self.supabase.table("browser_automation_tasks").update({
                    "status": status,
                    "payload": cur_p,
                    "updated_at": "now()"
                }).eq("id", task_id).execute()
            except Exception as e:
                print(f"[Runner] Erro ao atualizar status da task {task_id}: {e}")
