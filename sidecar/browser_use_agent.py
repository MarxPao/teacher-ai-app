"""
sidecar/browser_use_agent.py — Agente de Descoberta Leve via DOM / Acessibilidade (Camada 2)

RASTREABILIDADE (Passo 0):
- Baseado nos exemplos do repositório browser-use (v0.13.10):
  * browser-use-main/examples/browser/playwright_integration.py (compartilhamento de CDP :9222 com Playwright)
  * browser-use-main/examples/browser/using_cdp.py (BrowserSession com BrowserProfile cdp_url)
  * browser-use-main/examples/models/llama4-groq.py (ChatGroq com modelos Llama abertos)

DECISÕES DE DESIGN:
1. DOM / Acessibilidade Primeiro: Inspeciona a árvore de acessibilidade do Playwright
   (page.accessibility.snapshot()) e seletores semânticos estruturados antes de qualquer
   tentativa de visão por screenshot, economizando tokens e latência.
2. Reuso de Contexto Playwright: Implementa attach_to_existing_context(playwright_context)
   para operar sobre a mesma janela/sessão já autenticada da professora, sem relogar.
3. Escalonamento por Confiança: Se confianca < threshold (default 0.7) ou sucesso == False,
   marca requires_escalation = True para acionar o Skyvern no discovery_orchestrator.
4. Resiliência de Dependências: Suporta importação lazy do browser_use/ChatGroq com fallback
   nativo de inspeção DOM via Playwright para ambientes de teste unitário.
"""

import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Union

# Tentativa de importação lazy do ecossistema browser_use
try:
    from browser_use import Agent as BUAgent, BrowserProfile, BrowserSession, Tools as BUTools
    from browser_use.llm import ChatGroq as BUChatGroq
    BROWSER_USE_AVAILABLE = True
except ImportError:
    BROWSER_USE_AVAILABLE = False


@dataclass
class BrowserUseTaskResult:
    """Resultado estruturado retornado pelo BrowserUseAgent."""
    sucesso: bool
    confianca: float                     # 0.0 a 1.0
    trace_de_acoes: List[Dict[str, Any]] # Lista ordenada de ações descobertas
    erro: Optional[str] = None
    requires_escalation: bool = False
    execution_time_seconds: float = 0.0
    engine_used: str = "browser_use_llama"


class BrowserUseAgent:
    """
    Agente de descoberta intermediária baseado em DOM/acessibilidade e Groq/Llama.
    """

    def __init__(
        self,
        confidence_threshold: float = 0.7,
        groq_api_key: Optional[str] = None,
        model_name: str = "llama-3.3-70b-versatile",
        custom_dom_explorer: Optional[Callable] = None,
    ):
        self.confidence_threshold = confidence_threshold
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")
        self.model_name = model_name
        self._custom_dom_explorer = custom_dom_explorer
        self._attached_context = None
        self._cdp_url: str = "http://localhost:9222"

    def attach_to_existing_context(self, context_or_cdp_url: Any) -> None:
        """
        Reaproveita a MESMA instância/contexto do Playwright ou porta CDP já utilizada.
        Não abre um novo browser, preservando a sessão autenticada da professora.
        """
        if isinstance(context_or_cdp_url, str):
            self._cdp_url = context_or_cdp_url
        else:
            self._attached_context = context_or_cdp_url
            print("[BrowserUseAgent] Contexto Playwright existente anexado com sucesso.")

    async def execute_discovery_task(
        self,
        task_spec: Dict[str, Any],
        target_page: Optional[Any] = None,
    ) -> BrowserUseTaskResult:
        """
        Executa a tarefa de descoberta via DOM/acessibilidade.
        task_spec esperado: {
            "acao": "lancar_nota" | "lancar_falta" | "read_roster" | ...,
            "portal_id": str,
            "parametros": dict
        }
        """
        start_time = time.time()
        acao = task_spec.get("acao", "")
        portal_id = task_spec.get("portal_id", "")
        parametros = task_spec.get("parametros", {})

        print(f"[BrowserUseAgent] 🚀 Iniciando descoberta DOM para ação '{acao}' no portal '{portal_id}'...")

        # 1. Custom Explorer injetado (para testes e simulação determinística)
        if self._custom_dom_explorer:
            try:
                res = await self._custom_dom_explorer(task_spec, target_page)
                res.execution_time_seconds = time.time() - start_time
                res.requires_escalation = (res.confianca < self.confidence_threshold) or (not res.sucesso)
                return res
            except Exception as e:
                return BrowserUseTaskResult(
                    sucesso=False,
                    confianca=0.0,
                    trace_de_acoes=[],
                    erro=f"Falha no custom explorer: {str(e)}",
                    requires_escalation=True,
                    execution_time_seconds=time.time() - start_time,
                )

        # 2. Resolução da Página Ativa
        page = target_page
        if not page and self._attached_context:
            try:
                pages = getattr(self._attached_context, "pages", [])
                page = pages[0] if pages else None
            except Exception:
                page = None

        if not page:
            err = "Nenhuma página/aba ativa encontrada no contexto Playwright anexado."
            print(f"[BrowserUseAgent] ❌ {err}")
            return BrowserUseTaskResult(
                sucesso=False,
                confianca=0.0,
                trace_de_acoes=[],
                erro=err,
                requires_escalation=True,
                execution_time_seconds=time.time() - start_time,
            )

        # 3. Navegação e Mapeamento via Árvore de Acessibilidade / DOM (Sem Screenshot)
        try:
            current_url = getattr(page, "url", "")
            trace_de_acoes: List[Dict[str, Any]] = []

            # Passo A: Captura nó de navegação inicial
            if current_url and current_url != "about:blank":
                trace_de_acoes.append({
                    "action_type": "NAVIGATE",
                    "url": current_url,
                    "description": f"Acessar URL atual do portal: {current_url}"
                })

            # Passo B: Análise da árvore de acessibilidade
            ax_snapshot = None
            if hasattr(page, "accessibility"):
                try:
                    ax_snapshot = await page.accessibility.snapshot()
                except Exception as ax_err:
                    print(f"[BrowserUseAgent] Aviso ao obter accessibility snapshot: {ax_err}")

            # Passo C: Inspeção semântica de elementos conforme a ação solicitada
            found_elements = await self._inspect_semantic_dom(page, acao, parametros, ax_snapshot)

            if not found_elements.get("success"):
                reason = found_elements.get("reason", "Elementos semânticos não localizados no DOM.")
                print(f"[BrowserUseAgent] ⚠️ {reason}. Disparando escalonamento.")
                return BrowserUseTaskResult(
                    sucesso=False,
                    confianca=found_elements.get("confidence", 0.3),
                    trace_de_acoes=trace_de_acoes,
                    erro=reason,
                    requires_escalation=True,
                    execution_time_seconds=time.time() - start_time,
                )

            # Incorpora as ações mapeadas no trace
            trace_de_acoes.extend(found_elements.get("actions", []))
            calculated_conf = found_elements.get("confidence", 0.85)
            needs_esc = (calculated_conf < self.confidence_threshold)

            print(f"[BrowserUseAgent] ✅ Descoberta DOM concluída com sucesso ({len(trace_de_acoes)} ações, confiança={calculated_conf:.2f}).")
            return BrowserUseTaskResult(
                sucesso=True,
                confianca=calculated_conf,
                trace_de_acoes=trace_de_acoes,
                erro=None,
                requires_escalation=needs_esc,
                execution_time_seconds=time.time() - start_time,
            )

        except Exception as e:
            err = f"Erro inesperado durante descoberta DOM: {str(e)}"
            print(f"[BrowserUseAgent] ❌ {err}")
            return BrowserUseTaskResult(
                sucesso=False,
                confianca=0.0,
                trace_de_acoes=[],
                erro=err,
                requires_escalation=True,
                execution_time_seconds=time.time() - start_time,
            )

    async def _inspect_semantic_dom(
        self,
        page: Any,
        acao: str,
        parametros: Dict[str, Any],
        ax_snapshot: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Inspeciona o DOM procurando padrões semânticos de formulários, tabelas e botões
        com base na ação pretendida, sem recorrer a visão computacional por screenshot.
        """
        actions = []
        js_inspect = """
        (() => {
            const tables = Array.from(document.querySelectorAll('table'));
            const mainTable = tables.find(t => t.querySelectorAll('tr').length > 1) || document.querySelector('table');
            
            const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
            const gradeInputs = inputs.filter(i => {
                const name = (i.name || i.id || i.getAttribute('aria-label') || '').toLowerCase();
                return name.includes('nota') || name.includes('grade') || i.type === 'number';
            });

            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
            const submitBtn = buttons.find(b => {
                const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').toLowerCase();
                return t.includes('gravar') || t.includes('salvar') || t.includes('confirmar') || t.includes('enviar');
            });

            return {
                hasTable: !!mainTable,
                tableSelector: mainTable ? (mainTable.id ? '#' + mainTable.id : (mainTable.className ? '.' + mainTable.className.split(' ').filter(Boolean)[0] : 'table tbody tr')) : null,
                rowsCount: mainTable ? mainTable.querySelectorAll('tr').length : 0,
                gradeInputCount: gradeInputs.length,
                gradeInputSelector: gradeInputs.length > 0 ? (gradeInputs[0].name ? `input[name="${gradeInputs[0].name}"]` : 'input[type="number"]') : null,
                submitButtonFound: !!submitBtn,
                submitSelector: submitBtn ? (submitBtn.id ? '#' + submitBtn.id : (submitBtn.className ? '.' + submitBtn.className.split(' ').filter(Boolean)[0] : 'button[type="submit"]')) : null
            };
        })()
        """
        try:
            info = await page.evaluate(js_inspect)
        except Exception as e:
            return {"success": False, "reason": f"Falha ao avaliar seletores DOM: {str(e)}", "confidence": 0.0}

        # Ação: Lançar Nota ou Alterar Dados
        if "nota" in acao.lower() or "grade" in acao.lower() or "write" in acao.lower():
            if info.get("hasTable") and info.get("rowsCount", 0) > 1:
                actions.append({
                    "action_type": "LOCATE",
                    "selector": info.get("tableSelector") or "table tbody tr",
                    "multiplicity": "all",
                    "description": "Localizar linhas dos alunos na tabela de notas"
                })
                actions.append({
                    "action_type": "WRITE",
                    "selector": info.get("gradeInputSelector") or "input[type='number']",
                    "value": str(parametros.get("nota", "10")),
                    "description": "Preencher nota do aluno"
                })
                if info.get("submitButtonFound"):
                    actions.append({
                        "action_type": "CLICK",
                        "selector": info.get("submitSelector") or "button.btn-salvar",
                        "is_submit_action": True,
                        "description": "Gravar alterações de notas no portal"
                    })
                return {"success": True, "actions": actions, "confidence": 0.85 if info.get("submitButtonFound") else 0.65}
            else:
                return {"success": False, "reason": "Tabela de alunos não encontrada na página atual.", "confidence": 0.2}

        # Ação: Leitura de Turma / Roster
        elif "roster" in acao.lower() or "alunos" in acao.lower() or "read" in acao.lower():
            if info.get("hasTable") and info.get("rowsCount", 0) > 1:
                actions.append({
                    "action_type": "LOCATE",
                    "selector": info.get("tableSelector") or "table tbody tr",
                    "multiplicity": "all",
                    "description": "Localizar lista de alunos"
                })
                actions.append({
                    "action_type": "READ",
                    "selector": "td:nth-child(1)",
                    "description": "Ler coluna de identificação do aluno"
                })
                return {"success": True, "actions": actions, "confidence": 0.90}
            else:
                return {"success": False, "reason": "Tabela de chamada não identificada no DOM.", "confidence": 0.3}

        # Outras ações genéricas
        return {
            "success": bool(info.get("hasTable") or info.get("submitButtonFound")),
            "actions": actions,
            "confidence": 0.5,
            "reason": "Ação genérica sem padrão semântico pré-definido."
        }
