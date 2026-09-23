"""
test_intent_and_translation.py — Testes Unitários da Camada de Superfície Humana (Teacher AI)

Valida:
1. Extração de intenções (intent_parser.py) com slots completos e parciais.
2. Formulação de perguntas de esclarecimento naturais quando faltam dados.
3. Tradução de respostas técnicas para linguagem humana (response_translator.py).
4. Garantia estrita de ZERO JARGÃO TÉCNICO (sem CDP, drift, portas ou códigos HTTP).
5. Estruturação correta dos dados para o PortalApprovalCard.
"""

import pytest
import unittest
from unittest.mock import AsyncMock, patch

import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from intent_parser import extract_intent, dispatch_and_execute_task
from response_translator import translate_task_response, TECHNICAL_TERMS_BLACKLIST, sanitize_message


class TestIntentParserSlotsAndClarification(unittest.TestCase):
    def test_lancar_nota_completa(self):
        """Intenção completa com nota e aluno deve ser is_complete=True."""
        res = extract_intent("lança nota 9.5 para o Hugo Henrique")
        assert res["acao"] == "lancar_nota"
        assert res["aluno"] == "Hugo Henrique"
        assert res["nota"] == 9.5
        assert res["is_complete"] is True
        assert res["clarification_question"] is None

    def test_lancar_nota_formato_invertido(self):
        """Intenção com aluno antes da nota: 'Hugo Henrique nota 8.5'."""
        res = extract_intent("Hugo Henrique nota 8.5")
        assert res["acao"] == "lancar_nota"
        assert "Hugo" in res["aluno"]
        assert res["nota"] == 8.5
        assert res["is_complete"] is True

    def test_lancar_nota_sem_nota_gera_esclarecimento(self):
        """Quando a professora só informa o aluno, o sistema deve perguntar a nota."""
        res = extract_intent("lança nota pro Hugo")
        assert res["acao"] == "lancar_nota"
        assert "Hugo" in res["aluno"]
        assert res["nota"] is None
        assert res["is_complete"] is False
        assert res["clarification_question"] is not None
        assert "nota" in res["clarification_question"].lower()
        assert "Hugo" in res["clarification_question"]

    def test_lancar_nota_sem_aluno_gera_esclarecimento(self):
        """Quando a professora só informa a nota, o sistema deve perguntar o aluno."""
        res = extract_intent("lança nota 9.0")
        assert res["acao"] == "lancar_nota"
        assert res["aluno"] is None
        assert res["nota"] == 9.0
        assert res["is_complete"] is False
        assert res["clarification_question"] is not None
        assert "aluno" in res["clarification_question"].lower()
        assert "9.0" in res["clarification_question"] or "9" in res["clarification_question"]

    def test_lancar_falta_completa(self):
        """Lançamento de falta com aluno."""
        res = extract_intent("coloca falta na Milena Gomes")
        assert res["acao"] == "lancar_falta"
        assert "Milena" in res["aluno"]
        assert res["faltas"] == 1
        assert res["is_complete"] is True

    def test_lancar_falta_sem_aluno(self):
        """Lançamento de falta sem aluno gera pergunta de esclarecimento."""
        res = extract_intent("marca falta")
        assert res["acao"] == "lancar_falta"
        assert res["aluno"] is None
        assert res["is_complete"] is False
        assert "aluno" in res["clarification_question"].lower()

    def test_leitura_roster(self):
        """Pedido para ler alunos da turma."""
        res = extract_intent("quem são os alunos da turma?")
        assert res["acao"] == "read_roster"
        assert res["is_complete"] is True

    def test_detectar_estado_portal(self):
        """Pergunta sobre estado do portal."""
        res = extract_intent("o portal tá aberto?")
        assert res["acao"] == "detect_state"
        assert res["is_complete"] is True


class TestResponseTranslatorZeroJargon(unittest.TestCase):
    def test_draft_completed_pending_submit(self):
        """Valida que draft_completed gera mensagem acolhedora e card estruturado."""
        mock_raw = {
            "sucesso": True,
            "status": "draft_completed_pending_submit",
            "acao": "lancar_nota",
            "diff": {
                "aluno": "HUGO HENRIQUE DE SOUZA",
                "campo": "nota",
                "antes": "",
                "depois": "9.5",
                "drift_detectado": False
            },
            "screenshot": "C:\\fake\\audit.png",
            "tempo_ms": 1200
        }

        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is True
        assert translated["needs_approval"] is True
        assert translated["action_required"] == "confirm_approval"

        msg = translated["human_message"]
        assert "Hugo Henrique" in msg or "HUGO HENRIQUE" in msg
        assert "9.5" in msg
        assert "cartão" in msg.lower() or "card" in msg.lower()

        # Zero Jargon: proíbe termos técnicos
        for bad in ["cdp", "drift", "9222", "8765", "portal_id", "status code", "timeout"]:
            assert bad not in msg.lower()

        # Card de aprovação
        card = translated["approval_card_data"]
        assert card is not None
        assert card["actionType"] == "lancar_nota"
        assert len(card["diff"]) == 1
        assert card["diff"][0]["studentName"] == "HUGO HENRIQUE DE SOUZA"
        assert card["diff"][0]["afterValue"] == "9.5"
        assert card["screenshotUrl"] == "C:\\fake\\audit.png"

    def test_human_action_required_login(self):
        """Estado de login deve gerar instrução clara sem jargão."""
        mock_raw = {
            "sucesso": False,
            "status": "human_action_required",
            "estado": "login_screen",
            "mensagem": "Tela de login detectada. Requer credenciais."
        }
        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is False
        assert translated["needs_approval"] is False
        assert translated["action_required"] == "login_required"
        msg = translated["human_message"]
        assert "login" in msg.lower()
        assert "navegador" in msg.lower()
        for bad in ["cdp", "drift", "9222", "8765"]:
            assert bad not in msg.lower()

    def test_student_not_found(self):
        """Aluno não encontrado avisa com carinho para conferir o nome."""
        mock_raw = {
            "sucesso": False,
            "status": "student_not_found",
            "aluno": "Carlos Alberto",
            "mensagem": "Aluno 'Carlos Alberto' nao encontrado."
        }
        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is False
        msg = translated["human_message"]
        assert "Carlos Alberto" in msg
        assert "conferir" in msg.lower() or "encontrei" in msg.lower()
        for bad in ["locator", "dom", "table tr", "count == 0"]:
            assert bad not in msg.lower()

    def test_chrome_offline(self):
        """Chrome desconectado convida a clicar em 'Conectar Navegador'."""
        mock_raw = {
            "sucesso": False,
            "status": "chrome_offline",
            "mensagem": "Google Chrome dedicado (:9222) nao esta em execucao."
        }
        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is False
        assert translated["action_required"] == "open_browser"
        msg = translated["human_message"]
        assert "conectar navegador" in msg.lower()
        assert "9222" not in msg
        assert "cdp" not in msg.lower()

    def test_cdp_error(self):
        """Erro de conexão é amigável sem stacktrace."""
        mock_raw = {
            "sucesso": False,
            "status": "cdp_error",
            "mensagem": "Falha ao conectar via CDP: WebSocket connection failed"
        }
        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is False
        msg = translated["human_message"]
        assert "websocket" not in msg.lower()
        assert "cdp" not in msg.lower()

    def test_roster_extracted(self):
        """Leitura de lista relata quantidade de alunos."""
        mock_raw = {
            "sucesso": True,
            "status": "roster_extracted",
            "total_linhas": 25,
            "amostra_alunos": ["Hugo Henrique | 01", "Milena Pinto | 02"]
        }
        translated = translate_task_response(mock_raw)
        assert translated["sucesso"] is True
        msg = translated["human_message"]
        assert "25" in msg
        assert "Hugo Henrique" in msg


class TestDispatchAndExecuteTask(unittest.IsolatedAsyncioTestCase):
    async def test_incomplete_intent_stops_before_execution(self):
        """Se faltar dado obrigatório, retorna esclarecimento sem chamar execute_task_intent."""
        with patch("manual_runner.execute_task_intent") as mock_exec:
            res = await dispatch_and_execute_task("lança nota do Hugo")
            assert res["needs_clarification"] is True
            assert "nota" in res["mensagem"].lower()
            mock_exec.assert_not_called()

    async def test_complete_intent_dispatches_and_translates(self):
        """Se completo, executa e traduz com aprovação."""
        fake_task_result = {
            "sucesso": True,
            "status": "draft_completed_pending_submit",
            "acao": "lancar_nota",
            "diff": {
                "aluno": "Hugo Henrique",
                "campo": "nota",
                "antes": "",
                "depois": "9.5",
                "drift_detectado": False
            },
            "screenshot": "C:\\audit\\screen.png"
        }

        with patch("manual_runner.execute_task_intent", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = fake_task_result
            res = await dispatch_and_execute_task("lança nota 9.5 para o Hugo Henrique")

            assert res["needs_clarification"] is False
            assert res["sucesso"] is True
            assert res["card"] is not None
            assert res["card"]["afterValue"] == "9.5" if "afterValue" in res["card"] else res["card"]["diff"][0]["afterValue"] == "9.5"
            assert "9.5" in res["mensagem"]
            mock_exec.assert_called_once()


class TestManualServerHTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import threading
        from http.server import HTTPServer
        from manual_runner import ManualServerHandler

        cls.server = HTTPServer(("127.0.0.1", 0), ManualServerHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_get_portal_status_endpoint(self):
        import json
        import urllib.request

        url = f"http://127.0.0.1:{self.port}/portal_status"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert resp.status == 200
            assert "state" in data
            assert "label" in data

    def test_post_natural_intent_clarification(self):
        import json
        import urllib.request

        url = f"http://127.0.0.1:{self.port}/natural_intent"
        payload = json.dumps({"text": "lança nota do Hugo"}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert resp.status == 200
            assert data["needs_clarification"] is True
            assert "nota" in data["mensagem"].lower()

    def test_options_cors_endpoint(self):
        import urllib.request

        url = f"http://127.0.0.1:{self.port}/natural_intent"
        req = urllib.request.Request(url, headers={"Origin": "http://localhost:3000"}, method="OPTIONS")
        with urllib.request.urlopen(req, timeout=5) as resp:
            assert resp.status == 200
            assert resp.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"

