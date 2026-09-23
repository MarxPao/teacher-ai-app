"""
test_navigation_intent.py — Testes de validação da interpretação de navegação de abas e menus escolares
Valida:
1. Extração de intenção "navegar_aba" com o destino correto (ex: "Arquivos", "Diário")
2. Casos reais relatados pela professora ("ei rafinha entre nos arquivos no site", "entre na aba arquivos")
3. Não emissão de pedido indevido de esclarecimento para comandos de navegação completos
4. Execução de clique e navegação na aba do portal escolar (mock e runtime)
"""

import asyncio
import os
import subprocess
import pytest
from sidecar.intent_parser import extract_intent, dispatch_and_execute_task

EXTENSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension"))
PORTAL_MOCK_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "sandbox", "portal_mock.html"))


def test_intent_parser_navigation_phrases():
    """Valida que o interpretador de linguagem natural identifica corretamente pedidos de navegação para abas."""
    test_cases = [
        ("ei rafinha entre nos arquivos no site", "Arquivos"),
        ("entre na aba arquivos  via chat ela não está entendendo a função", "Arquivos"),
        ("entre na aba arquivos", "Arquivos"),
        ("ir para a aba diário", "Diário"),
        ("abrir notas", "Notas"),
        ("clica em chamadas", "Chamadas"),
        ("navegar para documentos", "Documentos"),
        ("entre em turmas", "Turmas"),
    ]

    for phrase, expected_target in test_cases:
        intent = extract_intent(phrase)
        assert intent["acao"] == "navegar_aba", f"Frase '{phrase}' deveria ter acao 'navegar_aba', obtido: {intent['acao']}"
        assert intent["destino"] == expected_target, f"Destino para '{phrase}' deveria ser '{expected_target}', obtido: '{intent['destino']}'"
        assert intent["is_complete"] is True, f"Intenção com destino definido deve ser is_complete=True"
        assert intent["clarification_question"] is None


@pytest.mark.asyncio
async def test_dispatch_and_execute_task_navigation():
    """Valida que dispatch_and_execute_task responde positivamente sem pedir detalhes desnecessários."""
    result = await dispatch_and_execute_task("ei rafinha entre nos arquivos no site")
    assert result["sucesso"] is True
    assert result["needs_clarification"] is False
    assert result["acao"] == "navegar_aba"
    assert "Arquivos" in result["mensagem"]
    assert result["status"] == "navigating_tab"


def test_side_panel_js_extract_navigation_target_via_node():
    """Valida a função extractNavigationTarget em JavaScript via Node.js."""
    node_script = """
    const fs = require('fs');

    global.document = {
      getElementById: () => ({ style: {}, appendChild: () => {}, querySelectorAll: () => [], addEventListener: () => {} }),
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, appendChild: () => {}, querySelectorAll: () => [], addEventListener: () => {} }),
      addEventListener: () => {}
    };
    global.window = {
      addEventListener: () => {},
      localStorage: { getItem: () => null, setItem: () => {} }
    };
    global.localStorage = global.window.localStorage;
    global.chrome = {
      tabs: { query: (q, cb) => cb ? cb([]) : Promise.resolve([]) },
      runtime: { sendMessage: () => {} }
    };

    const code = fs.readFileSync('teacher-extension/side_panel.js', 'utf-8');
    eval(code);

    const chat = global.window.__teacherSidePanelChat;
    if (!chat || typeof chat.extractNavigationTarget !== 'function') {
      throw new Error('extractNavigationTarget não foi exposto em __teacherSidePanelChat');
    }

    const testInputs = [
      ['ei rafinha entre nos arquivos no site', 'arquivos'],
      ['entre na aba arquivos  via chat ela não está entendendo a função', 'arquivos'],
      ['entre na aba arquivos', 'arquivos'],
      ['abrir notas', 'notas'],
      ['clica em chamadas', 'chamadas'],
      ['lança nota 8.5 para o João', null],
      ['abrir arquivos e selecionar sexto ano', 'arquivos'],
      ['abrir recados e responder à mãe do aluno', 'recados'],
      ['ir para o diário e lançar nota 8 pro Hugo', 'diário'],
      ['abrir diário de classe e selecionar sexto ano', 'diário de classe']
    ];

    for (const [input, expected] of testInputs) {
      const res = chat.extractNavigationTarget(input);
      if (expected === null) {
        if (res !== null) throw new Error(`Input '${input}' deveria ser null, obtido: '${res}'`);
      } else {
        if (!res || res.toLowerCase() !== expected.toLowerCase()) {
          throw new Error(`Input '${input}' deveria extrair exatamente '${expected}', obtido: '${res}'`);
        }
      }
    }

    // Valida splitCompoundCommand diretamente
    if (typeof chat.splitCompoundCommand !== 'function') {
      throw new Error('splitCompoundCommand não foi exposto em __teacherSidePanelChat');
    }

    const compoundCases = [
      {
        input: 'abrir arquivos e selecionar sexto ano',
        target: 'arquivos',
        conjunction: 'e',
        remaining: 'selecionar sexto ano',
        isCompound: true
      },
      {
        input: 'abrir recados e responder à mãe do aluno',
        target: 'recados',
        conjunction: 'e',
        remaining: 'responder à mãe do aluno',
        isCompound: true
      },
      {
        input: 'ir para o diário e lançar nota 8 pro Hugo',
        target: 'diário',
        conjunction: 'e',
        remaining: 'lançar nota 8 pro hugo',
        isCompound: true
      },
      {
        input: 'abrir diário de classe e selecionar sexto ano',
        target: 'diário de classe',
        conjunction: 'e',
        remaining: 'selecionar sexto ano',
        isCompound: true
      },
      {
        input: 'abrir arquivos',
        target: 'arquivos',
        conjunction: null,
        remaining: null,
        isCompound: false
      }
    ];

    for (const tc of compoundCases) {
      const sp = chat.splitCompoundCommand(tc.input);
      if (sp.navTarget !== tc.target) {
        throw new Error(`[${tc.input}] navTarget esperado '${tc.target}', obtido '${sp.navTarget}'`);
      }
      if (sp.isCompound !== tc.isCompound) {
        throw new Error(`[${tc.input}] isCompound esperado '${tc.isCompound}', obtido '${sp.isCompound}'`);
      }
      if (tc.remaining && sp.remainingCommand.toLowerCase() !== tc.remaining.toLowerCase()) {
        throw new Error(`[${tc.input}] remainingCommand esperado '${tc.remaining}', obtido '${sp.remainingCommand}'`);
      }
    }

    console.log('SUCCESS_NODE_NAV_EXTRACTION');
    process.exit(0);
    """

    res = subprocess.run(
        ["node", "-e", node_script],
        cwd=os.path.abspath(os.path.join(EXTENSION_DIR, "..")),
        capture_output=True,
        text=True,
        timeout=15
    )
    assert res.returncode == 0, f"Node extraction falhou:\nStdout: {res.stdout}\nStderr: {res.stderr}"
    assert "SUCCESS_NODE_NAV_EXTRACTION" in res.stdout


def test_compound_navigation_commands_in_python():
    """
    TESTE DE REGRESSÃO PERMANENTE:
    Valida que comandos compostos nunca contaminam o destino com conjunções ('e', 'então', 'depois')
    e sempre extraem a segunda instrução para os 3 casos identificados na auditoria:
    1. 'abrir arquivos e selecionar sexto ano'
    2. 'abrir recados e responder à mãe do aluno'
    3. 'ir para o diário e lançar nota 8 pro Hugo'
    """
    from sidecar.intent_parser import split_compound_command

    # Caso 1: abrir arquivos e selecionar sexto ano
    res1 = split_compound_command("abrir arquivos e selecionar sexto ano")
    assert res1["has_navigation"] is True
    assert res1["nav_target"] == "arquivos"
    assert "e" not in res1["nav_target"].split()
    assert res1["conjunction"] == "e"
    assert res1["remaining_command"] == "selecionar sexto ano"
    assert res1["is_compound"] is True

    # Caso 2: abrir recados e responder à mãe do aluno
    res2 = split_compound_command("abrir recados e responder à mãe do aluno")
    assert res2["has_navigation"] is True
    assert res2["nav_target"] == "recados"
    assert res2["remaining_command"] == "responder à mãe do aluno"
    assert res2["is_compound"] is True

    # Caso 3: ir para o diário e lançar nota 8 pro Hugo
    res3 = split_compound_command("ir para o diário e lançar nota 8 pro Hugo")
    assert res3["has_navigation"] is True
    assert res3["nav_target"] == "diário"
    assert "lançar" in res3["remaining_command"]
    assert res3["is_compound"] is True

    # Caso 4: Alvo multi-palavra legítimo ('diário de classe')
    res4 = split_compound_command("abrir diário de classe e selecionar sexto ano")
    assert res4["has_navigation"] is True
    assert res4["nav_target"] == "diário de classe"
    assert res4["remaining_command"] == "selecionar sexto ano"

    # Caso 5: extract_intent determinístico com dispatch_and_execute_task
    intent = extract_intent("abrir arquivos e selecionar sexto ano", groq_key="none", gemini_key="none")
    assert intent["acao"] == "navegar_aba"
    assert intent["destino"] == "Arquivos"
    assert intent["remaining_command"] == "selecionar sexto ano"


def test_portal_mock_html_has_arquivos_tab_and_turma_filter():
    """Valida que o portal_mock.html possui a aba de arquivos e o filtro de turma para seleção de 'Sexto Ano'."""
    with open(PORTAL_MOCK_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="tab-arquivos"' in html, "portal_mock.html deve conter botão de aba tab-arquivos"
    assert "Arquivos" in html
    assert 'id="pane-arquivos"' in html, "portal_mock.html deve conter container pane-arquivos"
    assert 'id="filtro_turma_arquivos"' in html, "portal_mock.html deve conter select filtro_turma_arquivos"
    assert "Sexto Ano" in html, "portal_mock.html deve conter opção Sexto Ano no filtro de arquivos"
    assert "switchTab('arquivos')" in html or 'switchTab("arquivos")' in html

