"""
test_read_roster_sandbox.py — Validação do read_roster com Mock e Paginação
Valida que o loop de paginação do BrowserHarnessRunner processa 2 páginas fictícias
(20 alunos na pág 1 + 15 alunos na pág 2 = 35 alunos totais) sem perdas e sem acionar submits.
"""

import unittest
import asyncio
import os
import sys

# Adiciona o diretório raiz do sidecar ao path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from browser_harness_runner import BrowserHarnessRunner
from capability_router import can_execute_autonomously

class MockPage:
    def __init__(self):
        self.current_page = 1
        self.max_pages = 2
        self.url = "https://machadosobrinho.paineldoaluno.com.br/professor_painel/alunos"

    async def evaluate(self, js_script: str):
        if self.current_page == 1:
            # 20 alunos da página 1
            return [
                {"name": f"Aluno Pag1_{i:02d}", "rollNumber": str(i), "portal_native_id": f"MAT_1{i:02d}", "status": "active", "nee_flag": (i == 5)}
                for i in range(1, 21)
            ]
        else:
            # 15 alunos da página 2
            return [
                {"name": f"Aluno Pag2_{i:02d}", "rollNumber": str(20 + i), "portal_native_id": f"MAT_2{i:02d}", "status": "active", "nee_flag": False}
                for i in range(1, 16)
            ]

    def locator(self, selector: str):
        mock_elem = self
        class MockLocator:
            def __init__(self, page_obj):
                self.page_obj = page_obj
                self.first = self

            async def count(self):
                # Se estiver na página 1, há botão próximo. Na página 2, não.
                return 1 if self.page_obj.current_page < self.page_obj.max_pages else 0

            async def is_visible(self):
                return self.page_obj.current_page < self.page_obj.max_pages

            async def is_disabled(self):
                return False

            async def get_attribute(self, attr):
                return ""

            async def click(self):
                self.page_obj.current_page += 1

        return MockLocator(mock_elem)

    async def wait_for_load_state(self, state, timeout=5000):
        pass


class TestReadRosterSandbox(unittest.TestCase):
    def setUp(self):
        self.runner = BrowserHarnessRunner(supabase_client=None)

    def test_capability_router_read_roster(self):
        can_run, complexity, reason = can_execute_autonomously(
            action_type="read_roster",
            portal="machado",
            model_provider="openai",
            model_name="gpt-4o"
        )
        self.assertTrue(can_run)
        self.assertEqual(complexity, "low_complexity")

    def test_read_roster_extraction_with_pagination(self):
        async def run_async_test():
            mock_page = MockPage()
            task = {
                "id": "task_test_roster_35",
                "class_ref": "7º Ano A",
                "payload": {
                    "pagination": {
                        "type": "next_button",
                        "nextSelector": ".pagination .next",
                        "maxPages": 5,
                        "delayBetweenPagesMs": 50 # Rápido no teste
                    }
                }
            }

            # Simula a captura de updates de status
            updated_payloads = {}
            def mock_update(t_id, status, extra):
                updated_payloads["status"] = status
                updated_payloads["extra"] = extra

            self.runner._update_task_status = mock_update

            success = await self.runner._handle_read_roster(
                task=task,
                page=mock_page,
                portal="machado",
                teacher_byok={"provider": "local", "model": "test"}
            )

            self.assertTrue(success)
            self.assertEqual(updated_payloads.get("status"), "done")
            extra = updated_payloads.get("extra", {})
            self.assertEqual(extra.get("total_scraped"), 35)
            self.assertEqual(extra.get("pages_read"), 2)
            self.assertTrue(extra.get("read_only"))
            self.assertEqual(len(extra.get("scraped_students", [])), 35)

        asyncio.run(run_async_test())


if __name__ == "__main__":
    unittest.main()
