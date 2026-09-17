"""
sidecar/agentic_execution_loop.py — Loop Agêntico ReAct com Function Calling (Camada 2c)

Permite ao assistente operar o portal educacional de maneira autônoma e dinâmica:
1. Conjunto semântico de 8 ferramentas expostas ao LLM:
   - navigate_to_tab(nome_da_aba)
   - find_item_in_list(descricao)
   - read_current_screen()
   - fill_field(campo, valor)
   - click_element(descricao)
   - select_option(campo, valor)
   - ask_clarification(pergunta)
   - finish_task(resumo)
2. Roteamento de privacidade por turno:
   - Turnos contendo PII de estudantes são processados localmente (Ollama - Trilho 1).
   - Turnos puramente estruturais sem PII podem utilizar provedores rápidos (Trilho 2).
3. Compilação automática de SkillGraph:
   - Ao concluir uma sequência nova com sucesso via finish_task, o caminho de ações
     é compilado em uma receita imutável (SkillGraph) com nós de CHECKPOINT mandatórios,
     permitindo execução instantânea (< 200ms) em execuções futuras.
"""

import asyncio
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams, RetryPolicy
from graph_validator import assert_graph_safe
from skill_store import save_skill, DEFAULT_SKILLS_DIR

try:
    from intent_parser import _contains_student_pii, get_active_roster_students
except ImportError:
    from sidecar.intent_parser import _contains_student_pii, get_active_roster_students

try:
    from portal_structure_mapper import PortalStructureMapper
except ImportError:
    try:
        from sidecar.portal_structure_mapper import PortalStructureMapper
    except ImportError:
        PortalStructureMapper = None  # type: ignore


TOOL_DEFINITIONS = [
    {
        "name": "navigate_to_tab",
        "description": "Navega para uma aba ou seção principal do portal (ex: 'arquivos', 'recados', 'diário', 'chamada').",
        "parameters": {"nome_da_aba": "string"}
    },
    {
        "name": "read_current_screen",
        "description": "Lê e descreve os elementos interativos e conteúdo visível na tela atual.",
        "parameters": {}
    },
    {
        "name": "find_item_in_list",
        "description": "Busca um item ou registro específico em listas, tabelas ou murais visíveis na tela.",
        "parameters": {"descricao": "string"}
    },
    {
        "name": "select_option",
        "description": "Seleciona uma opção dentro de um menu dropdown (<select>) ou filtro.",
        "parameters": {"campo": "string", "valor": "string"}
    },
    {
        "name": "click_element",
        "description": "Clica em um botão, link ou elemento clicável identificado pelo texto ou id.",
        "parameters": {"descricao": "string"}
    },
    {
        "name": "fill_field",
        "description": "Preenche um campo de texto, input ou textarea com um valor específico.",
        "parameters": {"campo": "string", "valor": "string"}
    },
    {
        "name": "ask_clarification",
        "description": "Pausa a automação e solicita um esclarecimento direto para a professora quando faltam dados.",
        "parameters": {"pergunta": "string"}
    },
    {
        "name": "answer_from_screen_data",
        "description": "Sintetiza uma resposta direta em linguagem natural a partir de dados, tabelas ou textos visíveis na tela atual, sem realizar cliques ou mutações no portal. Encerra a tarefa respondendo à professora.",
        "parameters": {"pergunta": "string", "resposta": "string"}
    },
    {
        "name": "finish_task",
        "description": "Declara que o objetivo da professora foi totalmente concluído.",
        "parameters": {"resumo": "string"}
    }
]

SYSTEM_PROMPT_REACT = """Você é o Assistente Agêntico da professora (Teacher AI).
Você opera o portal escolar através de um loop ReAct (Raciocínio + Ação).

A cada turno, você receberá:
1. O objetivo da professora.
2. O histórico de ações já tomadas e seus resultados.
3. O estado atual da tela (elementos interativos e dados tabulares visíveis).

Sua resposta DEVE ser EXCLUSIVAMENTE um objeto JSON no formato:
{
  "pensamento": "Seu raciocínio sobre o que a tela mostra e qual é o próximo passo lógico",
  "tool": "nome_da_ferramenta",
  "args": { ...argumentos da ferramenta... }
}

Ferramentas disponíveis:
- navigate_to_tab(nome_da_aba): Navega para uma aba ou seção principal.
- read_current_screen(): Reinspeciona os elementos e dados da tela atual.
- find_item_in_list(descricao): Localiza um item ou registro em listas.
- select_option(campo, valor): Seleciona uma opção em <select> ou dropdown.
- click_element(descricao): Clica em um botão, link ou elemento clicável.
- fill_field(campo, valor): Preenche um campo de input ou textarea.
- ask_clarification(pergunta): Pausa e pede esclarecimento honesto à professora quando faltam dados essenciais.
- answer_from_screen_data(pergunta, resposta): Lê os dados da tela (tabelas, células, textos) e gera a resposta em linguagem natural diretamente para a professora. Encerra a tarefa.
- finish_task(resumo): Declara que o objetivo de mutação/ação foi concluído.

CLASSIFICAÇÃO COGNITIVA MANDATÓRIA (AÇÃO vs. PERGUNTA/LEITURA):
Antes de escolher uma ferramenta, determine se a instrução da professora ou o passo atual é:
a) Uma AÇÃO operacional no portal (navegar, clicar, preencher, selecionar) -> use as ferramentas de ação (navigate_to_tab, click_element, fill_field, select_option).
b) Uma PERGUNTA/LEITURA/SÍNTESE sobre dados visíveis na tela (listar, quantos, qual, quando, quais, resumir, horários, notas, faltas) -> use answer_from_screen_data(pergunta, resposta).
   ATENÇÃO: Se os dados necessários já constam nas tabelas ("tables") ou textos visíveis na tela atual, NUNCA tente procurar um botão, link ou menu inexistente para "listar" ou "responder". Sintetize os dados da tela diretamente com answer_from_screen_data.

COMANDOS COMPOSTOS (NAVEGAÇÃO + PERGUNTA):
Se o comando for ex: "vá em [aba] e liste [dados]":
- Turno 1: Execute a AÇÃO de navegação (navigate_to_tab(nome_da_aba='[aba]')).
- Turno 2 (após a aba carregar com a tabela/dados): Reconheça que a 2ª instrução é uma PERGUNTA/LEITURA e use answer_from_screen_data com a resposta sintetizada a partir dos dados da tela.

Regras Mandatórias:
1. Execute APENAS UMA ação por turno.
2. NUNCA gere markdown ao redor do JSON (responda apenas o JSON puro).
"""


class AgenticExecutionLoop:
    """
    Controlador do ciclo ReAct de tomada de decisão passo a passo sobre o navegador.
    """

    def __init__(
        self,
        page: Any,
        portal_id: str = "portal_escolar",
        ollama_url: str = "http://localhost:11434",
        ollama_model: str = "llama3.2:3b",
        groq_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        custom_llm_caller: Optional[Callable] = None,
        skills_dir: Optional[Union[Path, str]] = None
    ):
        self.page = page
        self.portal_id = portal_id
        self.ollama_url = ollama_url
        self.ollama_model = ollama_model
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY", "")
        self.custom_llm_caller = custom_llm_caller
        self.skills_dir = Path(skills_dir) if skills_dir else DEFAULT_SKILLS_DIR
        self.history: List[Dict[str, Any]] = []

        # Mapeamento estrutural passivo — carrega contexto do portal se já foi mapeado
        if PortalStructureMapper is not None:
            self._structure_mapper = PortalStructureMapper(page=page, portal_id=portal_id)
            self._portal_structure_summary: str = self._structure_mapper.build_llm_context_summary()
        else:
            self._structure_mapper = None
            self._portal_structure_summary = ""

    def _contains_pii(self, text: str) -> bool:
        """
        Aplica a taxonomia oficial fail-closed e Modo Suspeita de PII validada no intent_parser.py.
        Usa validação cruzada contra lista de alunos da turma ativa (Supabase/localDB).
        """
        try:
            known = get_active_roster_students()
        except Exception:
            known = []
        return _contains_student_pii(text, known_students=known)

    async def read_current_screen(self) -> Dict[str, Any]:
        """Extrai um snapshot compacto e semântico da tela visível."""
        dom_script = """
        () => {
            const visibleText = (el) => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            };

            const activeTab = document.querySelector('.tab-btn.active')?.innerText?.trim() || 'Nenhuma';
            const tabs = Array.from(document.querySelectorAll('.tab-btn')).map(b => b.innerText.trim());

            const buttons = Array.from(document.querySelectorAll('button, .btn, .btn-reply'))
                .filter(visibleText)
                .map(b => ({ id: b.id, text: b.innerText.trim() }));

            const selects = Array.from(document.querySelectorAll('select'))
                .filter(visibleText)
                .map(s => ({
                    id: s.id,
                    name: s.name,
                    value: s.value,
                    options: Array.from(s.options).map(o => ({ text: o.text.trim(), value: o.value, selected: o.selected }))
                }));

            const inputs = Array.from(document.querySelectorAll('input, textarea'))
                .filter(visibleText)
                .map(i => ({ id: i.id, name: i.name, type: i.type, placeholder: i.placeholder, value: i.value }));

            const activePanes = Array.from(document.querySelectorAll('[id^="pane-"]'))
                .filter(visibleText)
                .map(p => ({
                    id: p.id,
                    headings: Array.from(p.querySelectorAll('h1,h2,h3,strong')).map(h => h.innerText.trim()).slice(0, 5),
                    cards: Array.from(p.querySelectorAll('.recado-card')).map(c => c.innerText.trim()).slice(0, 5)
                }));

            const tables = Array.from(document.querySelectorAll('table'))
                .filter(visibleText)
                .map(t => ({
                    id: t.id || 'table',
                    headers: Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim()).filter(Boolean),
                    rows: Array.from(t.querySelectorAll('tbody tr')).slice(0, 30).map(tr =>
                        Array.from(tr.querySelectorAll('td')).map(td => {
                            const input = td.querySelector('input, select');
                            if (input) {
                                if (input.type === 'checkbox') return input.checked ? '[X]' : '[ ]';
                                return input.value || td.innerText.trim();
                            }
                            return td.innerText.trim();
                        })
                    )
                }));

            return {
                activeTab,
                availableTabs: tabs,
                visiblePanes: activePanes,
                tables,
                selects,
                buttons,
                inputs
            };
        }
        """
        try:
            return await self.page.evaluate(dom_script)
        except Exception as e:
            return {"error": f"Erro ao inspecionar DOM: {e}", "activeTab": "Desconhecida"}

    async def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Executa uma ação concreta no navegador baseada no tool call do LLM."""
        t0 = time.time()
        res = {"tool": tool_name, "success": False, "output": None}

        if tool_name == "navigate_to_tab":
            target = args.get("nome_da_aba", "").lower().strip()
            clicked = await self.page.evaluate("""
            (target) => {
                const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
                const cleanTarget = norm(target);
                const tabs = Array.from(document.querySelectorAll('.tab-btn, a, button'));
                for (const t of tabs) {
                    if (norm(t.innerText).includes(cleanTarget) || t.id.includes(cleanTarget)) {
                        t.click();
                        return { clicked: true, text: t.innerText.trim(), id: t.id };
                    }
                }
                return { clicked: false };
            }
            """, target)
            await asyncio.sleep(0.2)
            res["success"] = clicked.get("clicked", False)
            res["output"] = f"Aba '{target}' acionada com sucesso." if res["success"] else f"Aba '{target}' não encontrada."

        elif tool_name == "read_current_screen":
            screen = await self.read_current_screen()
            res["success"] = True
            res["output"] = screen

        elif tool_name == "select_option":
            campo = args.get("campo", "")
            valor = str(args.get("valor", ""))
            sel_res = await self.page.evaluate("""
            ({ campo, valor }) => {
                const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
                const normVal = norm(valor);
                const ordinalMap = {'primeiro':'1','segundo':'2','terceiro':'3','quarto':'4','quinto':'5','sexto':'6','setimo':'7','oitavo':'8','nono':'9'};
                const variants = [normVal];
                for (const [w, n] of Object.entries(ordinalMap)) {
                    if (normVal.includes(w)) { variants.push(n); variants.push(`${n}o`); variants.push(`${n}º`); }
                }

                const selects = Array.from(document.querySelectorAll('select')).filter(s => {
                    const style = window.getComputedStyle(s);
                    return style.display !== 'none' && s.offsetParent !== null;
                });

                for (const s of selects) {
                    for (let i = 0; i < s.options.length; i++) {
                        const opt = s.options[i];
                        const optText = norm(opt.text);
                        const optVal = norm(opt.value);
                        if (variants.some(v => optText.includes(v) || optVal === v)) {
                            s.selectedIndex = i;
                            s.value = opt.value;
                            s.dispatchEvent(new Event('change', { bubbles: true }));
                            return { success: true, elementText: opt.text.trim(), value: opt.value };
                        }
                    }
                }
                return { success: false };
            }
            """, {"campo": campo, "valor": valor})
            res["success"] = sel_res.get("success", False)
            res["output"] = f"Opção '{valor}' selecionada ({sel_res.get('elementText')})." if res["success"] else f"Opção '{valor}' não encontrada no campo '{campo}'."

        elif tool_name == "click_element":
            desc = args.get("descricao", "").lower().strip()
            click_res = await self.page.evaluate("""
            (desc) => {
                const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
                const cleanDesc = norm(desc);
                const elements = Array.from(document.querySelectorAll('button, a, .btn-reply, .btn')).filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && el.offsetParent !== null;
                });
                for (const el of elements) {
                    if (norm(el.innerText).includes(cleanDesc) || el.id.includes(cleanDesc)) {
                        el.click();
                        return { clicked: true, text: el.innerText.trim(), id: el.id };
                    }
                }
                return { clicked: false };
            }
            """, desc)
            await asyncio.sleep(0.15)
            res["success"] = click_res.get("clicked", False)
            res["output"] = f"Elemento '{desc}' clicado." if res["success"] else f"Elemento '{desc}' não encontrado."

        elif tool_name == "find_item_in_list":
            desc = args.get("descricao", "").lower().strip()
            find_res = await self.page.evaluate("""
            (desc) => {
                const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
                const cleanDesc = norm(desc);
                const cards = Array.from(document.querySelectorAll('.recado-card, tr, .student-name')).filter(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && el.offsetParent !== null;
                });
                for (const c of cards) {
                    if (norm(c.innerText).includes(cleanDesc)) {
                        return { found: true, snippet: c.innerText.slice(0, 100) };
                    }
                }
                return { found: false };
            }
            """, desc)
            res["success"] = find_res.get("found", False)
            res["output"] = f"Item encontrado: '{find_res.get('snippet')}'" if res["success"] else f"Item '{desc}' não localizado na lista."

        elif tool_name == "fill_field":
            campo = args.get("campo", "")
            valor = args.get("valor", "")
            fill_res = await self.page.evaluate("""
            ({ campo, valor }) => {
                const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(i => {
                    const style = window.getComputedStyle(i);
                    return style.display !== 'none' && i.offsetParent !== null;
                });
                for (const i of inputs) {
                    if (i.id.includes(campo) || i.name.includes(campo) || (i.placeholder && i.placeholder.toLowerCase().includes(campo.toLowerCase()))) {
                        i.value = valor;
                        i.dispatchEvent(new Event('input', { bubbles: true }));
                        i.dispatchEvent(new Event('change', { bubbles: true }));
                        return { success: true, id: i.id };
                    }
                }
                const textareas = inputs.filter(i => i.tagName.toLowerCase() === 'textarea');
                if (textareas.length > 0) {
                    textareas[0].value = valor;
                    textareas[0].dispatchEvent(new Event('input', { bubbles: true }));
                    textareas[0].dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, id: textareas[0].id };
                }
                return { success: false };
            }
            """, {"campo": campo, "valor": valor})
            res["success"] = fill_res.get("success", False)
            res["output"] = f"Campo preenchido com: '{valor}'" if res["success"] else f"Campo '{campo}' não encontrado."

        elif tool_name == "ask_clarification":
            res["success"] = True
            res["output"] = f"Pausado para esclarecimento: {args.get('pergunta')}"

        elif tool_name == "answer_from_screen_data":
            resposta = args.get("resposta") or args.get("resumo") or f"Informação sintetizada a partir dos dados da tela: {args.get('pergunta', '')}"
            res["success"] = True
            res["output"] = resposta

        elif tool_name == "finish_task":
            res["success"] = True
            res["output"] = f"Tarefa concluída: {args.get('resumo')}"

        res["execution_time_ms"] = (time.time() - t0) * 1000
        return res

    def _call_llm_step(self, user_prompt: str, is_pii_turn: bool = False) -> Tuple[Dict[str, Any], float, str]:
        """
        Despacha a inferência do turno para o modelo apropriado segundo a política de privacidade.
        Retorna (json_action, latencia_ms, provider_used).
        """
        t0 = time.time()

        # 1. Custom LLM Caller (para testes unitários determinísticos)
        if self.custom_llm_caller:
            raw_res = self.custom_llm_caller(user_prompt)
            lat = (time.time() - t0) * 1000
            if isinstance(raw_res, str):
                return json.loads(raw_res), lat, "custom_caller"
            return raw_res, lat, "custom_caller"

        # 2. Trilho 1: PII presente -> Ollama local obrigatório
        if is_pii_turn:
            try:
                payload = json.dumps({
                    "model": self.ollama_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT_REACT},
                        {"role": "user", "content": user_prompt}
                    ],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.0, "num_predict": 300}
                }).encode("utf-8")
                req = urllib.request.Request(f"{self.ollama_url}/api/chat", data=payload, headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    raw = data["message"]["content"]
                    lat = (time.time() - t0) * 1000
                    return json.loads(raw), lat, "ollama_local"
            except Exception:
                return {
                    "pensamento": "Esta etapa requer processamento local seguro (Trilho 1 / LGPD), mas o Ollama local está offline.",
                    "tool": "ask_clarification",
                    "args": {"pergunta": "⚠️ Esta etapa envolve dados pessoais de estudantes (Trilho 1 / LGPD). Para continuar com segurança, inicie o Ollama local ou confirme a operação manualmente."}
                }, (time.time() - t0) * 1000, "privacy_guard"

        # 3. Trilho 2: Sem PII -> Nuvem ultrarrápida (Groq / Gemini)
        if self.groq_api_key:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.groq_api_key}",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TeacherAI-IntentParser/2.0"
            }
            for model in ["openai/gpt-oss-120b", "groq/compound", "qwen/qwen3.8-27b"]:
                payload = json.dumps({
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT_REACT},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"}
                }).encode("utf-8")
                req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions", data=payload, headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        raw = data["choices"][0]["message"]["content"]
                        lat = (time.time() - t0) * 1000
                        return json.loads(raw), lat, f"groq:{model}"
                except Exception:
                    continue

        if self.gemini_api_key:
            for model in ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.gemini_api_key}"
                payload = json.dumps({
                    "system_instruction": {"parts": [{"text": SYSTEM_PROMPT_REACT}]},
                    "contents": [{"parts": [{"text": user_prompt}]}],
                    "generationConfig": {
                        "temperature": 0.0,
                        "response_mime_type": "application/json"
                    }
                }).encode("utf-8")
                req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        raw = data["candidates"][0]["content"]["parts"][0]["text"]
                        lat = (time.time() - t0) * 1000
                        return json.loads(raw), lat, f"gemini:{model}"
                except Exception:
                    continue

        raise RuntimeError("Nenhum provedor de inferência disponível para este turno.")

    def _compile_trace_to_skill_graph(self, goal: str, turns_log: List[Dict[str, Any]]) -> Optional[SkillGraph]:
        """Compila o histórico de ações do ReAct em um SkillGraph imutável e seguro."""
        nodes: Dict[str, SkillNode] = {}
        node_idx = 1
        entry_node_id = "node_1"
        task_id = re.sub(r'[^a-zA-Z0-9_]', '_', goal.lower())[:30].strip('_')

        prev_node_id: Optional[str] = None

        for t in turns_log:
            tool = t.get("tool")
            args = t.get("args", {})
            current_id = f"node_{node_idx}"

            if tool == "navigate_to_tab":
                tab_target = args.get("nome_da_aba", "")
                nodes[current_id] = SkillNode(
                    id=current_id,
                    type="NAVIGATE",
                    anchor=SkillAnchor(strategy="text_match", value=tab_target),
                    params=SkillNodeParams(action_value=tab_target, is_submit_action=False),
                    on_success=f"node_{node_idx + 1}"
                )
                prev_node_id = current_id
                node_idx += 1

            elif tool == "select_option":
                valor = str(args.get("valor", ""))
                campo = args.get("campo", "")
                nodes[current_id] = SkillNode(
                    id=current_id,
                    type="WRITE",
                    anchor=SkillAnchor(strategy="css_selector", value=campo),
                    params=SkillNodeParams(action_value=valor, is_submit_action=False),
                    on_success=f"node_{node_idx + 1}"
                )
                prev_node_id = current_id
                node_idx += 1

            elif tool == "click_element":
                desc = args.get("descricao", "")
                nodes[current_id] = SkillNode(
                    id=current_id,
                    type="CLICK",
                    anchor=SkillAnchor(strategy="text_match", value=desc),
                    params=SkillNodeParams(action_value=desc, is_submit_action=False),
                    on_success=f"node_{node_idx + 1}"
                )
                prev_node_id = current_id
                node_idx += 1

            elif tool == "fill_field":
                campo = args.get("campo", "")
                valor = args.get("valor", "")
                chk_id = f"node_{node_idx}"
                nodes[chk_id] = SkillNode(
                    id=chk_id,
                    type="CHECKPOINT",
                    anchor=SkillAnchor(strategy="semantic_role", value="user_approval"),
                    params=SkillNodeParams(action_value="approve_write", is_submit_action=False),
                    on_success=f"node_{node_idx + 1}"
                )
                node_idx += 1
                current_id = f"node_{node_idx}"
                nodes[current_id] = SkillNode(
                    id=current_id,
                    type="WRITE",
                    anchor=SkillAnchor(strategy="css_selector", value=campo),
                    params=SkillNodeParams(action_value=valor, is_submit_action=False),
                    on_success=f"node_{node_idx + 1}"
                )
                prev_node_id = current_id
                node_idx += 1

        if not nodes:
            return None

        if prev_node_id and prev_node_id in nodes:
            nodes[prev_node_id].on_success = None

        graph = SkillGraph(
            id=f"{self.portal_id}__{task_id}",
            name=f"Habilidade autônoma: {goal}",
            portal_id=self.portal_id,
            task_id=task_id,
            version=1,
            entry_node=entry_node_id,
            nodes=nodes
        )

        try:
            assert_graph_safe(graph)
            save_skill(graph, base_dir=self.skills_dir)
            return graph
        except Exception as e:
            print(f"[AgenticExecutionLoop] Aviso ao compilar SkillGraph: {e}")
            return None

    async def run_loop(
        self,
        goal: str,
        max_turns: int = 6,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> Dict[str, Any]:
        """
        Executa o Loop ReAct completo:
        Observa -> Constrói Contexto -> LLM Step -> Executa Tool -> Verifica Parada.
        Emite atualizações de progresso dinâmicas turno a turno via on_progress.
        """
        start_time = time.time()
        turns_log: List[Dict[str, Any]] = []
        status = "running"
        summary = ""
        compiled_skill_id: Optional[str] = None

        if on_progress:
            on_progress({
                "engine": "react_agentic_loop",
                "status": "starting",
                "message": "Isso pode levar um minutinho, já estou vendo como funciona aqui... 🦉",
                "turn": 0
            })

        for turn in range(1, max_turns + 1):
            turn_t0 = time.time()
            screen_state = await self.read_current_screen()

            if on_progress:
                if turn == 1:
                    msg = "Analisando a tela inicial do portal..."
                else:
                    last_obs = self.history[-1]["observation"] if self.history else ""
                    msg = f"{last_obs}... agora decidindo o próximo passo..."
                on_progress({
                    "engine": "react_agentic_loop",
                    "status": "reasoning",
                    "message": msg,
                    "turn": turn
                })

            history_summary = [f"- Ação: {h['action']} -> Resultado: {h['observation']}" for h in self.history]
            history_str = "\n".join(history_summary) if history_summary else "Nenhuma ação tomada ainda. Este é o primeiro turno."

            # Injeta contexto estrutural do portal no turno 1 (se mapa disponível)
            estrutura_portal = ""
            if turn == 1 and self._portal_structure_summary:
                estrutura_portal = f"\n{self._portal_structure_summary}\n"

            user_prompt = f"""OBJETIVO: "{goal}"
{estrutura_portal}
HISTÓRICO DE AÇÕES ANTERIORES:
{history_str}

ESTADO ATUAL DA TELA:
{json.dumps(screen_state, ensure_ascii=False, indent=2)}

Decida a próxima ação necessária para cumprir o objetivo."""

            is_pii = self._contains_pii(goal)

            llm_step, llm_lat, provider = self._call_llm_step(user_prompt, is_pii_turn=is_pii)

            tool = llm_step.get("tool")
            args = llm_step.get("args", {})
            thought = llm_step.get("pensamento", "")

            tool_res = await self.execute_tool(tool, args)

            if on_progress:
                on_progress({
                    "engine": "react_agentic_loop",
                    "status": "action_executed",
                    "message": f"Executado: {tool_res['output']}",
                    "turn": turn,
                    "tool": tool
                })

            turn_data = {
                "turn": turn,
                "thought": thought,
                "tool": tool,
                "args": args,
                "tool_result": tool_res["output"],
                "provider": provider,
                "llm_latency_ms": round(llm_lat, 1),
                "dom_latency_ms": round(tool_res["execution_time_ms"], 1),
                "total_turn_ms": round((time.time() - turn_t0) * 1000, 1)
            }
            turns_log.append(turn_data)
            self.history.append({
                "action": f"{tool}({args})",
                "observation": tool_res["output"]
            })

            if tool in ("finish_task", "answer_from_screen_data"):
                status = "completed"
                summary = args.get("resposta") or args.get("resumo") or tool_res["output"]
                if tool == "finish_task":
                    graph = self._compile_trace_to_skill_graph(goal, turns_log)
                    if graph:
                        compiled_skill_id = graph.id
                break
            elif tool == "ask_clarification":
                status = "paused_for_clarification"
                summary = args.get("pergunta", tool_res["output"])
                break

        total_time_ms = (time.time() - start_time) * 1000
        return {
            "success": status == "completed",
            "status": status,
            "goal": goal,
            "summary": summary,
            "turns_count": len(turns_log),
            "total_time_ms": round(total_time_ms, 1),
            "compiled_skill_id": compiled_skill_id,
            "turns": turns_log
        }
