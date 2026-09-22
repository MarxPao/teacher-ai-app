import unittest
import asyncio
from unittest.mock import MagicMock
from intent_parser import _parse_with_regex_rules
from response_translator import translate_task_response
from browser_use_agent import BrowserUseAgent

class TestGenericItemDiscovery(unittest.TestCase):
    def test_responder_recado_missing_content_requires_clarification(self):
        cmd = "responder Rodrigo (responsável) na aba início nos últimos recados"
        res = _parse_with_regex_rules(cmd)
        self.assertEqual(res["verbo_acao"], "responder")
        self.assertEqual(res["objeto_alvo"], "recado")
        self.assertTrue("Rodrigo" in res["aluno"])
        self.assertEqual(res["destino"], "Início")
        self.assertFalse(res["is_complete"])
        self.assertIn("O que você gostaria de responder para", res["clarification_question"])

    def test_responder_recado_with_content_is_complete(self):
        cmd = "responder Rodrigo dizendo que o aluno melhorou bastante"
        res = _parse_with_regex_rules(cmd)
        self.assertEqual(res["verbo_acao"], "responder")
        self.assertTrue(res["is_complete"])
        self.assertEqual(res["valor"], "o aluno melhorou bastante")
        self.assertIsNone(res["clarification_question"])

    def test_baixar_arquivo_generic_intent(self):
        cmd = "baixar arquivo autorizacao_passeio.pdf"
        res = _parse_with_regex_rules(cmd)
        self.assertEqual(res["verbo_acao"], "baixar")
        self.assertEqual(res["objeto_alvo"], "arquivo")
        self.assertIn("autorizacao_passeio.pdf", res["aluno"])
        self.assertTrue(res["is_complete"])

    def test_generic_discovery_failed_translation(self):
        task_res = {
            "sucesso": False,
            "status": "discovery_failed",
            "acao": "responder_recado",
            "objeto_alvo": "recado",
            "aluno": "Rodrigo",
            "portal": "machado_sobrinho"
        }
        translated = translate_task_response(task_res)
        self.assertFalse(translated["sucesso"])
        self.assertEqual(translated["action_required"], "point_and_click")
        self.assertEqual(translated["status"], "point_and_click_required")
        self.assertIn("responder", translated["human_message"].lower())
        self.assertIn("recado", translated["human_message"].lower())
        self.assertIn("rodrigo", translated["human_message"].lower())
        self.assertIn("você pode me mostrar clicando no lugar certo", translated["human_message"])

    def test_generic_discovery_failed_translation_for_file(self):
        task_res = {
            "sucesso": False,
            "status": "discovery_failed",
            "acao": "baixar_arquivo",
            "objeto_alvo": "arquivo",
            "aluno": "autorizacao.pdf",
            "portal": "machado_sobrinho"
        }
        translated = translate_task_response(task_res)
        self.assertEqual(translated["action_required"], "point_and_click")
        self.assertIn("baixar", translated["human_message"].lower())
        self.assertIn("autorizacao.pdf", translated["human_message"])

if __name__ == '__main__':
    unittest.main()
