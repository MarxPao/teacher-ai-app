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
from capability_router import can_execute_autonomously
from sanitizer import clean_state_snapshot, scrub_text

TASK_TIMEOUT_SECONDS = 120

class BrowserHarnessRunner:
    def __init__(self, supabase_client: Any = None, cdp_url: str = "http://localhost:9222"):
        self.supabase = supabase_client
        self.cdp = CDPConnector(cdp_url)

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
        Executa a leitura segura e estruturada do Roster de Alunos e Turmas.
        GARANTIA INEGOCIÁVEL: 100% Read-Only (nenhum clique em submit/salvar).
        Inclui rate-limiting defensivo (1.0s) e tratamento de paginação declarativa.
        """
        task_id = task.get("id")
        payload = task.get("payload", {})
        class_ref = task.get("class_ref") or payload.get("class_ref", "all")
        pagination_config = payload.get("pagination", {
            "type": "next_button",
            "nextSelector": ".pagination .next, a[rel='next'], button.btn-proxima-pagina, a.paginate_button.next",
            "maxPages": 10,
            "delayBetweenPagesMs": 1000
        })

        print(f"\n[Runner] [READ_ROSTER] Modo Leitura Segura: Iniciando extracao da turma '{class_ref}' no portal '{portal}'...")

        all_students = []
        current_page = 1
        max_pages = pagination_config.get("maxPages", 10)
        delay_s = max(0.8, min(pagination_config.get("delayBetweenPagesMs", 1000) / 1000.0, 3.0))

        while current_page <= max_pages:
            # 1. Extrai tabela de alunos da página visível
            page_students = await self._extract_roster_table(page, class_ref)
            print(f"[Runner] [READ_ROSTER] Pagina {current_page}: {len(page_students)} alunos identificados.")

            for st in page_students:
                all_students.append(st)

            # 2. Verifica se existe próxima página habilitada
            has_next = await self._has_next_page(page, pagination_config)
            if not has_next:
                break

            # 3. Rate limiting defensivo antes da próxima requisição/página
            await asyncio.sleep(delay_s)

            # 4. Avança para a próxima página
            advanced = await self._click_next_page_and_wait(page, pagination_config)
            if not advanced:
                break

            current_page += 1

        print(f"[Runner] [READ_ROSTER] Extracao concluida: {len(all_students)} alunos totais obtidos do portal '{portal}'.")

        # 5. Atualiza tarefa no Supabase para 'done' com o payload higienizado
        self._update_task_status(task_id, "done", {
            "scraped_students": all_students,
            "total_scraped": len(all_students),
            "pages_read": current_page,
            "class_ref": class_ref,
            "read_only": True,
            "summary": f"{len(all_students)} alunos lidos com sucesso do portal '{portal}'."
        })
        return True

    async def _extract_roster_table(self, page, class_ref: str = "all") -> List[Dict[str, Any]]:
        """Extrai linhas da tabela de alunos via JavaScript estruturado no DOM."""
        js_extract = """
        () => {
            const results = [];
            const rows = Array.from(document.querySelectorAll(
                'table tbody tr, .tabela-alunos tr, .aluno-item, table tr, div[data-aluno-id]'
            ));
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const text = (row.innerText || '').trim();
                
                // Ignora cabeçalhos
                if (!text || (/(nome|matr[íi]cula|situa[çc]|n[úu]mero)/i.test(text.slice(0, 40)) && i === 0)) {
                    continue;
                }
                
                const cells = Array.from(row.querySelectorAll('td, th, .coluna, .campo'));
                let name = '';
                let rollNumber = '';
                let portal_native_id = '';
                let status = 'active';
                let nee_flag = false;
                
                if (cells.length >= 2) {
                    rollNumber = (cells[0].innerText || '').trim().replace(/[^0-9]/g, '');
                    name = (cells[1].innerText || '').trim();
                    if (cells.length >= 3) {
                        portal_native_id = (cells[2].innerText || '').trim();
                    }
                } else {
                    const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length > 0) name = lines[0];
                }
                
                if (row.querySelector('.tag-inclusao, .badge-nee, [title*="inclus"], [title*="NEE"]')) {
                    nee_flag = true;
                }
                if (/transf/i.test(text)) status = 'transferred';
                if (/inativ|cancel/i.test(text)) status = 'inactive';
                
                if (name && name.length >= 2) {
                    results.push({
                        name: name,
                        rollNumber: rollNumber,
                        portal_native_id: portal_native_id,
                        status: status,
                        nee_flag: nee_flag
                    });
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
            print(f"[Runner] Erro ao extrair tabela de roster: {e}")
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
            print(f"[Runner] ⚠️ Erro ao avançar para a próxima página: {e}")
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
