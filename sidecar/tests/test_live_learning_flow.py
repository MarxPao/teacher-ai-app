"""
Testes Unitários: Fluxo de Aprendizado ao Vivo e UX Conversacional Pura
Teacher AI / Blissful Noether

Validações:
1. Disparo automático do DiscoveryOrchestrator para ações inéditas sem confirmação prévia.
2. Exploração ESTRITAMENTE SOMENTE-LEITURA: vetando qualquer clique em elementos destrutivos
   (ex: 'excluir', 'cancelar matrícula', 'remover', 'deletar').
3. Mensagem de progresso com gestão de expectativa realista e acompanhamento ("Ainda trabalhando nisso...").
4. Fallback para pergunta natural de esclarecimento ("Não encontrei onde lançar falta nesta tela...")
   com modo de apontar/clicar.
5. Garantia física de que o modo apontar/clicar via overlay NUNCA dispara cliques reais no portal.
6. Isolamento estrito de painéis manuais/técnicos dentro do Dev Mode na extensão.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import json
import os
import sys
import subprocess
from pathlib import Path
import re

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))


class TestLiveLearningFlow(unittest.IsolatedAsyncioTestCase):

    async def test_unmapped_action_triggers_discovery_orchestrator_without_confirmation(self):
        """
        Garante que quando uma ação ainda não está mapeada (sem SkillGraph salvo),
        o manual_runner dispara o DiscoveryOrchestrator diretamente, sem pedir confirmação prévia.
        """
        from manual_runner import execute_task_intent
        from response_translator import translate_task_response
        from skill_store import SkillNotFoundError

        intent = {
            "acao": "lancar_falta",
            "aluno": "Hugo",
            "faltas": 1,
            "portal": "escola_inedita.com.br",
            "portal_url": "https://escola_inedita.com.br/diario"
        }

        # Simula DiscoveryOrchestrator tendo sucesso
        mock_disc_result = {
            "success": True,
            "engine_used": "browser_use",
            "screenshot_path": "/tmp/screenshot_falta_hugo.png",
            "trace": ["[BrowserUseAgent] Campo de falta encontrado e preenchido."]
        }

        with patch("manual_runner.bridge_instance.has_active_portal_tab", return_value=False), \
             patch("skill_store.load_skill", side_effect=SkillNotFoundError("não existe")), \
             patch("discovery_orchestrator.DiscoveryOrchestrator.discover_or_execute", new_callable=AsyncMock) as mock_discover:

            mock_discover.return_value = mock_disc_result

            # Executa a intenção
            result = await execute_task_intent(intent)

            # 1. Confirma que DiscoveryOrchestrator foi chamado automaticamente com os parâmetros corretos
            mock_discover.assert_awaited_once_with(
                portal_id="escola_inedita.com.br",
                acao="lancar_falta",
                parametros={"aluno": "Hugo", "nota": None, "faltas": 1, "turma": ""},
                portal_url="https://escola_inedita.com.br/diario"
            )

            # 2. Confirma retorno com diff pronto para aprovação
            self.assertTrue(result.get("sucesso"))
            self.assertEqual(result.get("status"), "draft_completed_pending_submit")
            self.assertEqual(result.get("diff", {}).get("aluno"), "Hugo")
            self.assertEqual(result.get("diff", {}).get("campo"), "falta")
            self.assertEqual(result.get("diff", {}).get("depois"), "1")

            # 3. Traduz para a professora e valida PortalApprovalCard
            translated = translate_task_response(result)
            self.assertTrue(translated.get("needs_approval"))
            self.assertIsNotNone(translated.get("approval_card_data"))
            card = translated["approval_card_data"]
            self.assertEqual(card["diff"][0]["studentName"], "Hugo")
            self.assertEqual(card["diff"][0]["afterValue"], "1")
            self.assertIn("Hugo", translated["human_message"])
            self.assertIn("cartão abaixo", translated["human_message"])
            # Nunca deve conter termos técnicos como "skill", "macro" ou "gravação de trajeto"
            self.assertNotIn("skill", translated["human_message"].lower())
            self.assertNotIn("gravação", translated["human_message"].lower())
            self.assertNotIn("trajeto", translated["human_message"].lower())

    def test_strict_read_only_exploration_blocks_destructive_actions(self):
        """
        Ponto 1: Garante que durante a exploração agêntica, nenhuma ação classificada
        como destrutiva (excluir, remover, cancelar matrícula, deletar) seja executada
        ou incorporada ao SkillGraph.
        """
        from discovery_orchestrator import is_destructive_action, DiscoveryOrchestrator
        from portal_map_store import PortalMapStore

        # Ações destrutivas simuladas
        destructive_actions = [
            {"action_type": "CLICK", "selector": "#btn-excluir-matricula", "description": "Excluir matrícula do aluno"},
            {"action_type": "CLICK", "selector": "button.cancelar-matricula", "description": "Cancelar matrícula"},
            {"action_type": "CLICK", "selector": ".btn-delete", "text": "Remover aluno da turma"},
            {"action_type": "CLICK", "selector": "a#apagar-registro", "description": "Apagar histórico"}
        ]

        for act in destructive_actions:
            self.assertTrue(
                is_destructive_action(act),
                f"Ação destrutiva deveria ter sido detectada e bloqueada: {act}"
            )

        # Ações seguras de navegação e leitura
        safe_actions = [
            {"action_type": "NAVIGATE", "url": "https://escola.com/turma/8a", "description": "Navegar até diário"},
            {"action_type": "LOCATE", "selector": "table tbody tr", "description": "Localizar linhas"},
            {"action_type": "READ", "selector": "td.aluno-nome", "description": "Ler nome do aluno"},
            {"action_type": "WRITE", "selector": "input[name='nota']", "value": "9.0", "description": "Preencher nota"}
        ]

        for act in safe_actions:
            self.assertFalse(
                is_destructive_action(act),
                f"Ação segura não deveria ter sido marcada como destrutiva: {act}"
            )

        # Valida que o DiscoveryOrchestrator remove ações destrutivas do trace compilado
        orchestrator = DiscoveryOrchestrator(map_store=PortalMapStore())
        mixed_trace = safe_actions + destructive_actions

        with patch("skill_store.save_skill", return_value="fake/path.json"):
            graph = orchestrator._compile_trace_to_skill_graph(
                portal_id="escola_teste",
                task_id="lancar_nota",
                trace=mixed_trace,
                discovery_engine="test",
                confidence=0.9
            )

            # O grafo final gerado NÃO pode conter nenhum seletor ou descrição das ações destrutivas
            for node in graph.nodes.values():
                val = ""
                if node.anchor and node.anchor.value:
                    val += node.anchor.value.lower()
                if node.params and node.params.description:
                    val += node.params.description.lower()

                self.assertNotIn("excluir", val)
                self.assertNotIn("cancelar", val)
                self.assertNotIn("delete", val)
                self.assertNotIn("apagar", val)

    async def test_discovery_failure_returns_natural_point_and_click_clarification(self):
        """
        Se a exploração automática do DiscoveryOrchestrator falhar, deve responder
        com a pergunta de esclarecimento natural e solicitar point_and_click.
        """
        from manual_runner import execute_task_intent
        from response_translator import translate_task_response
        from skill_store import SkillNotFoundError

        intent = {
            "acao": "lancar_falta",
            "aluno": "Hugo",
            "faltas": 1,
            "portal": "escola_inedita.com.br"
        }

        mock_disc_failed = {
            "success": False,
            "error": "Nenhum seletor de falta encontrado após 3 tentativas.",
            "trace": ["[Discovery] Fallback falhou."]
        }

        with patch("manual_runner.bridge_instance.has_active_portal_tab", return_value=False), \
             patch("skill_store.load_skill", side_effect=SkillNotFoundError("não existe")), \
             patch("discovery_orchestrator.DiscoveryOrchestrator.discover_or_execute", new_callable=AsyncMock) as mock_discover:

            mock_discover.return_value = mock_disc_failed

            result = await execute_task_intent(intent)

            self.assertFalse(result.get("sucesso"))
            self.assertEqual(result.get("status"), "discovery_failed")

            translated = translate_task_response(result)
            self.assertFalse(translated.get("needs_approval"))
            self.assertEqual(translated.get("action_required"), "point_and_click")
            # Pergunta natural exata especificada nos requisitos
            self.assertIn("Não encontrei onde lançar falta nesta tela, você pode me mostrar clicando no lugar certo?", translated.get("human_message"))

    def test_realistic_progress_message_and_follow_up_timer(self):
        """
        Ponto 2: Garante que a mensagem de progresso gerencia expectativa real
        ("Isso pode levar um minutinho na primeira vez...") e possui timer de follow-up (~18s).
        """
        side_panel_html = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension", "side_panel.html"))
        side_panel_js = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension", "side_panel.js"))

        with open(side_panel_html, "r", encoding="utf-8") as f:
            html_content = f.read()

        with open(side_panel_js, "r", encoding="utf-8") as f:
            js_content = f.read()

        # 1. side_panel.html deve conter a cópia realista
        self.assertIn("Isso pode levar um minutinho na primeira vez, já estou vendo como funciona aqui...", html_content)
        self.assertNotIn("um instante...", html_content)

        # 2. side_panel.js deve conter a chamada e o timer de acompanhamento
        self.assertIn("Isso pode levar um minutinho na primeira vez, já estou vendo como funciona aqui...", js_content)
        self.assertIn("progressTimer", js_content)
        self.assertIn("Ainda trabalhando nisso...", js_content)
        self.assertIn("18000", js_content)

    def test_extension_side_panel_has_no_technical_macro_recorder_in_default_view(self):
        """
        Garante que no HTML da extensão (side_panel.html):
        - Painel de skills gravadas, formulário de nova skill e gravação estão ocultos em #dev-mode-panel.
        - A visão padrão não contém botões "Ensinar Novo Caminho" ou "Iniciar Gravação".
        """
        html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension", "side_panel.html"))
        self.assertTrue(os.path.exists(html_path), f"Arquivo não encontrado: {html_path}")

        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()

        # O dev-mode-panel deve existir e iniciar com display: none
        self.assertIn('id="dev-mode-panel"', content)
        self.assertIn('style="display: none;"', content)

        # Divide o conteúdo: antes do dev-mode-panel (visão da professora) e dentro do dev-mode-panel
        parts = content.split('<div id="dev-mode-panel"')
        teacher_view = parts[0]
        dev_view = parts[1] if len(parts) > 1 else ""

        # Na visão da professora NÃO pode haver:
        self.assertNotIn("Ensinar Novo Caminho", teacher_view)
        self.assertNotIn("Iniciar Gravação", teacher_view)
        self.assertNotIn("Skills Gravadas", teacher_view)
        self.assertNotIn("Definir e Salvar Nova Skill", teacher_view)

        # Mas esses elementos continuam preservados dentro de dev_view para QA/Desenvolvedores
        self.assertIn("Ensinar Novo Caminho", dev_view)
        self.assertIn("Skills Gravadas", dev_view)

        # Na visão da professora deve haver o Assistente Conversacional e os cards de UX natural
        self.assertIn('id="agentic-action-card"', teacher_view)
        self.assertIn('id="card-natural-progress"', teacher_view)
        self.assertIn('Isso pode levar um minutinho na primeira vez, já estou vendo como funciona aqui...', teacher_view)
        self.assertIn('id="card-clarification-point-click"', teacher_view)
        self.assertIn('id="card-approval-preview"', teacher_view)

    def test_point_and_click_overlay_prevents_portal_clicks(self):
        """
        Ponto 3: Executa a validação em Node do content.js garantindo que o overlay
        intercepta fisicamente o clique e que 0 cliques são propagados para o portal real.
        """
        node_script = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "teacher-extension", "test_point_and_click_security.js"))
        self.assertTrue(os.path.exists(node_script), f"Script de teste Node não encontrado: {node_script}")

        res = subprocess.run(["node", node_script], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Falha no teste Node do overlay: {res.stderr}\n{res.stdout}")
        self.assertIn("0 cliques propagados para o portal", res.stdout)


if __name__ == "__main__":
    unittest.main()
