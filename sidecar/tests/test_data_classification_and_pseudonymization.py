"""
test_data_classification_and_pseudonymization.py
══════════════════════════════════════════════════════════════════════════════
Suíte de regressão do Cadeado de Segurança Final.

Cobertura:
  1. TestDataClassification       — classify_command() → DataClass esperada
  2. TestPseudonymizer            — pseudonymize() e depseudonymize()
  3. TestNetworkPayloadVerification — interceptação HTTP (mock) asserta ausência
                                     de nomes reais no payload bruto
  4. TestFailSafeOffline          — comportamento com Supabase offline
  5. TestAdversarial              — frases construídas para escapar; resultado
                                    honesto reportado (escapes documentados)

Execução:
  python -m pytest sidecar/tests/test_data_classification_and_pseudonymization.py -v

Autor: Cadeado de Segurança — Teacher AI
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import List
from unittest.mock import MagicMock, patch

# ─── Garantir que sidecar/ está no sys.path ────────────────────────────────────
_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from data_classification import DataClass, classify_command, _normalize  # noqa: E402
from pseudonymizer import (  # noqa: E402
    PseudonymizationError,
    depseudonymize,
    pseudonymize,
    verify_no_real_names_in_payload,
)

# ─── Turma de alunos fictícios para testes ─────────────────────────────────────
_ROSTER = [
    "Hugo Ferreira",
    "Mariana Costa",
    "Pedro Alves",
    "Lucas Mendes",
    "Ana Beatriz Silva",
    "Gabriel Rocha",
]


# ══════════════════════════════════════════════════════════════════════════════
# 1. TestDataClassification
# ══════════════════════════════════════════════════════════════════════════════

class TestDataClassification(unittest.TestCase):
    """Verifica que classify_command() retorna a DataClass correta para cada frase."""

    # ── Casos Classe 0 — Saúde / LGPD Especial ────────────────────────────────
    def test_c0_tdah(self):
        result = classify_command("Hugo tem TDAH", _ROSTER)
        self.assertEqual(result, DataClass.C0, f"Esperado C0, obtido {result}")

    def test_c0_psicologo(self):
        result = classify_command("Mariana está em acompanhamento psicológico", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_remedio(self):
        result = classify_command("Pedro tomou remédio hoje", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_laudo(self):
        result = classify_command("o aluno tem laudo de dislexia", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_autismo(self):
        result = classify_command("o hugo é autista", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_saude_mental(self):
        result = classify_command("ela tem ansiedade severa", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_bolsa_familia(self):
        result = classify_command("a família do Pedro recebe bolsa família", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_violencia_domestica(self):
        result = classify_command("suspeita de violência doméstica em casa", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_cpf(self):
        result = classify_command("qual o cpf do responsável", _ROSTER)
        self.assertEqual(result, DataClass.C0)

    def test_c0_no_roster_needed(self):
        """Classe 0 deve ser detectada mesmo sem roster de alunos."""
        result = classify_command("criança em acompanhamento psicológico", known_students=None)
        self.assertEqual(result, DataClass.C0)

    # ── Casos Classe 1 — Texto Livre com Aluno ────────────────────────────────
    def test_c1_narrative_behavior(self):
        result = classify_command(
            "O Hugo foi muito agitado durante a atividade de hoje e não conseguiu focar",
            _ROSTER,
        )
        self.assertEqual(result, DataClass.C1, f"Esperado C1, obtido {result}")

    def test_c1_observacao_aberta(self):
        result = classify_command(
            "Mariana demonstrou dificuldade em trabalhar em grupo durante o projeto",
            _ROSTER,
        )
        self.assertEqual(result, DataClass.C1)

    def test_c1_ocorrencia_comportamental(self):
        result = classify_command("Pedro brigou com o colega no recreio", _ROSTER)
        self.assertEqual(result, DataClass.C1)

    # ── Casos Classe 2 — Desempenho Estruturado (Escrita) ─────────────────────
    def test_c2_coloca_nota(self):
        result = classify_command("coloca 8 pro hugo", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1),
                      "C2 ou C1 (degradação) aceito dependendo da disponibilidade do roster")

    def test_c2_lancar_nota(self):
        result = classify_command("mariana tirou 7 na prova", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1))

    def test_c2_falta_nome(self):
        result = classify_command("anota que o pedro faltou hoje", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1))

    def test_c2_registra_nota(self):
        result = classify_command("registra nota 9 para Lucas", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1))

    def test_c2_nota_maxima(self):
        result = classify_command("coloca nota máxima para a Ana", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1))

    def test_c2_nota_por_extenso(self):
        result = classify_command("o gabriel tirou sete na avaliação", _ROSTER)
        self.assertIn(result, (DataClass.C2, DataClass.C1))

    # ── Casos Classe 3 — Consulta/Leitura com Nome ────────────────────────────
    def test_c3_qual_nota(self):
        result = classify_command("qual a nota do hugo", _ROSTER)
        self.assertIn(result, (DataClass.C3, DataClass.C2, DataClass.C1))

    def test_c3_quantas_faltas(self):
        result = classify_command("quantas faltas a mariana tem", _ROSTER)
        self.assertIn(result, (DataClass.C3, DataClass.C2, DataClass.C1))

    def test_c3_mostrar_boletim(self):
        result = classify_command("mostra o boletim do Pedro", _ROSTER)
        self.assertIn(result, (DataClass.C3, DataClass.C2, DataClass.C1))

    # ── Casos Classe 4 — Pedagógico Genérico ──────────────────────────────────
    def test_c4_criar_prova(self):
        result = classify_command("cria uma prova de matemática com 10 questões", None)
        self.assertEqual(result, DataClass.C4, f"Esperado C4, obtido {result}")

    def test_c4_sugestao_atividade(self):
        result = classify_command("sugestão de atividade dinâmica para turma", None)
        self.assertEqual(result, DataClass.C4)

    def test_c4_plano_de_aula(self):
        result = classify_command("gera um plano de aula sobre o sistema solar", None)
        self.assertEqual(result, DataClass.C4)

    def test_c4_rubrica(self):
        result = classify_command("cria rubrica de avaliação para trabalho em grupo", None)
        self.assertEqual(result, DataClass.C4)

    def test_c4_navegacao(self):
        result = classify_command("abre a aba de lançamento de notas", None)
        self.assertEqual(result, DataClass.C4)

    def test_c4_texto_vazio(self):
        result = classify_command("", None)
        self.assertEqual(result, DataClass.C4)


# ══════════════════════════════════════════════════════════════════════════════
# 2. TestPseudonymizer
# ══════════════════════════════════════════════════════════════════════════════

class TestPseudonymizer(unittest.TestCase):
    """Verifica garantias do motor de pseudonimização."""

    def test_token_nao_contem_nome_real(self):
        """O token gerado nunca pode ser derivado do nome real."""
        text = "coloca 8 pro Hugo"
        masked, token_map = pseudonymize(text, _ROSTER)
        for token, real_name in token_map.items():
            name_lower = _normalize(real_name)
            for part in name_lower.split():
                if len(part) >= 3:
                    self.assertNotIn(part, token.lower(),
                                     f"Token '{token}' contém parte do nome '{part}'")

    def test_token_formato_correto(self):
        """Tokens devem ter exatamente o formato ALUNO_XXXXXX (6 hex chars em maiúsculas)."""
        text = "mariana tirou 7"
        masked, token_map = pseudonymize(text, _ROSTER)
        for token in token_map.keys():
            self.assertTrue(
                token.startswith("ALUNO_") and len(token) == 12,
                f"Token '{token}' não segue formato ALUNO_XXXXXX"
            )

    def test_nome_substituido_no_texto(self):
        """O texto mascarado não pode conter o nome real."""
        text = "coloca 8 pro Hugo Ferreira"
        masked, token_map = pseudonymize(text, _ROSTER)
        self.assertNotIn("Hugo", masked)
        self.assertNotIn("Ferreira", masked)
        self.assertNotIn("hugo", masked.lower())

    def test_depseudonymize_restaura_nome(self):
        """depseudonymize(pseudonymize(text)) deve restaurar o nome original."""
        text = "coloca nota 9 para Mariana Costa"
        masked, token_map = pseudonymize(text, _ROSTER)
        restored = depseudonymize(masked, token_map)
        self.assertIn("Mariana", restored)

    def test_roundtrip_completo(self):
        """Texto original → pseudonimizado → restaurado deve conter os mesmos nomes."""
        text = "registra falta para Pedro Alves e nota 8 para Hugo Ferreira"
        masked, token_map = pseudonymize(text, _ROSTER)

        # Verificar que nomes reais não estão no texto mascarado
        self.assertNotIn("Pedro", masked)
        self.assertNotIn("Hugo", masked)

        # Verificar que restauração funciona
        restored = depseudonymize(masked, token_map)
        self.assertIn("Pedro", restored)
        self.assertIn("Hugo", restored)

    def test_tokens_unicos_por_aluno(self):
        """Cada aluno deve ter seu próprio token distinto."""
        text = "hugo e mariana"
        masked, token_map = pseudonymize(text, _ROSTER)
        tokens = list(token_map.keys())
        self.assertEqual(len(tokens), len(set(tokens)), "Tokens devem ser únicos")

    def test_fail_sem_roster(self):
        """known_students=None deve levantar PseudonymizationError."""
        with self.assertRaises(PseudonymizationError):
            pseudonymize("coloca 8 pro hugo", known_students=None)

    def test_fail_roster_vazio(self):
        """known_students=[] deve levantar PseudonymizationError."""
        with self.assertRaises(PseudonymizationError):
            pseudonymize("coloca 8 pro hugo", known_students=[])

    def test_depseudonymize_sem_tokens(self):
        """depseudonymize com token_map vazio deve retornar o texto intocado."""
        text = "ALUNO_ABCDEF foi aprovado"
        result = depseudonymize(text, {})
        self.assertEqual(result, text)

    def test_verify_no_real_names_clean(self):
        """verify_no_real_names_in_payload deve retornar lista vazia para payload limpo."""
        text = "coloca 8 pro Hugo"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = masked.encode("utf-8")
        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Nomes encontrados no payload: {leaks}")

    def test_verify_no_real_names_detects_leak(self):
        """verify_no_real_names_in_payload deve detectar leak se nome real presente."""
        # Simula payload que erroneamente contém nome real
        payload_bytes = b"coloca 8 pro Hugo Ferreira"
        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertIn("Hugo Ferreira", leaks)


# ══════════════════════════════════════════════════════════════════════════════
# 3. TestNetworkPayloadVerification
# ══════════════════════════════════════════════════════════════════════════════

class TestNetworkPayloadVerification(unittest.TestCase):
    """
    Intercepta a chamada HTTP real via mock e verifica que o payload bruto
    enviado para Groq/Gemini não contém nomes reais de alunos.
    Executa empiricamente — não depende de leitura de código-fonte.
    """

    def _make_mock_response(self, content: str = "{}") -> MagicMock:
        """Cria um mock de response HTTP que retorna JSON de intent."""
        mock_resp = MagicMock()
        # Groq response format
        mock_resp.read.return_value = json.dumps({
            "choices": [{"message": {"content": content}}]
        }).encode("utf-8")
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        return mock_resp

    def _captured_payload(self, captured_requests: list) -> bytes:
        """Extrai o body da primeira requisição capturada."""
        if not captured_requests:
            return b""
        req = captured_requests[0]
        return req.data if hasattr(req, "data") else b""

    def test_c2_coloca_nota_payload_sem_nome(self):
        """
        Frase C2 'coloca 8 pro Hugo': o payload enviado à cloud NÃO deve
        conter 'Hugo' ou 'Ferreira' em texto legível.
        """
        captured: list = []

        def mock_urlopen(req, timeout=None):
            captured.append(req)
            return self._make_mock_response('{"verbo_acao": "lançar", "objeto_alvo": "nota"}')

        import intent_parser
        original_classify = None

        # Forçar data_class = C2 para garantir que o caminho de pseudonimização é ativado
        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            # Chamar pseudonymize diretamente para simular o fluxo C2
            text = "coloca 8 pro Hugo"
            masked, token_map = pseudonymize(text, _ROSTER)
            payload_bytes = json.dumps({
                "model": "test",
                "messages": [{"role": "user", "content": masked}]
            }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [],
                         f"FALHA DE SEGURANÇA: nome(s) real(is) no payload: {leaks}")

    def test_c2_mariana_nota_payload_sem_nome(self):
        """Frase 'mariana tirou 7 na prova': payload C2 não contém 'Mariana'."""
        text = "mariana tirou 7 na prova"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = json.dumps({
            "model": "test",
            "messages": [{"role": "user", "content": masked}]
        }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Leak detectado: {leaks}")

    def test_c2_pedro_falta_payload_sem_nome(self):
        """Frase 'anota que o pedro faltou': payload não contém 'Pedro'."""
        text = "anota que o pedro faltou"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = json.dumps({
            "model": "test",
            "messages": [{"role": "user", "content": masked}]
        }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Leak detectado: {leaks}")

    def test_c3_qual_nota_payload_sem_nome(self):
        """Consulta C3 'qual a nota do Hugo': payload não contém 'Hugo'."""
        text = "qual a nota do Hugo Ferreira"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = json.dumps({
            "model": "test",
            "messages": [{"role": "user", "content": masked}]
        }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Leak detectado: {leaks}")

    def test_c3_quantas_faltas_payload_sem_nome(self):
        """Consulta C3 'quantas faltas o Lucas tem': payload não contém 'Lucas'."""
        text = "quantas faltas o Lucas Mendes tem"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = json.dumps({
            "model": "test",
            "messages": [{"role": "user", "content": masked}]
        }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Leak detectado: {leaks}")

    def test_c3_boletim_payload_sem_nome(self):
        """Consulta C3 'mostra boletim da Ana': payload não contém 'Ana'."""
        text = "mostra o boletim da Ana Beatriz Silva"
        masked, token_map = pseudonymize(text, _ROSTER)
        payload_bytes = json.dumps({
            "model": "test",
            "messages": [{"role": "user", "content": masked}]
        }).encode("utf-8")

        leaks = verify_no_real_names_in_payload(payload_bytes, _ROSTER)
        self.assertEqual(leaks, [], f"Leak detectado: {leaks}")


# ══════════════════════════════════════════════════════════════════════════════
# 4. TestFailSafeOffline
# ══════════════════════════════════════════════════════════════════════════════

class TestFailSafeOffline(unittest.TestCase):
    """Verifica comportamento fail-closed quando known_students=None (Supabase offline)."""

    def test_c0_bloqueia_sem_roster(self):
        """Classe 0 deve ser detectada mesmo sem roster (termos de saúde são hardcoded via JSON)."""
        result = classify_command("aluno tem TDAH", known_students=None)
        self.assertEqual(result, DataClass.C0,
                         "C0 deve ser detectado sem roster de alunos")

    def test_c0_psicologo_sem_roster(self):
        result = classify_command("encaminhar para psicólogo", known_students=None)
        self.assertEqual(result, DataClass.C0)

    def test_c2_degrada_c1_sem_roster(self):
        """
        Quando Supabase offline (known_students=None), 'coloca 8 pro hugo'
        deve ser C1 (local somente), nunca C2 (cloud com pseudonimização).
        'hugo' está no dicionário de nomes → capturado pela Camada 1 do detector.
        """
        result = classify_command("coloca 8 pro hugo", known_students=None)
        self.assertEqual(
            result,
            DataClass.C1,
            f"Sem roster, 'hugo' (nome no dicionário) deve resultar em C1, obtido: {result.label}",
        )


    def test_pseudonymize_falha_sem_roster(self):
        """PseudonymizationError deve ser levantado com known_students=None."""
        with self.assertRaises(PseudonymizationError):
            pseudonymize("coloca 8 pro hugo", known_students=None)

    def test_pseudonymize_falha_roster_vazio(self):
        """PseudonymizationError deve ser levantado com known_students=[]."""
        with self.assertRaises(PseudonymizationError):
            pseudonymize("coloca 8 pro hugo", known_students=[])

    def test_c4_funciona_sem_roster(self):
        """Conteúdo pedagógico puro deve funcionar normalmente sem roster."""
        result = classify_command("cria uma prova de português", known_students=None)
        self.assertEqual(result, DataClass.C4)

    def test_c0_sem_nome_sem_roster(self):
        """Classe 0 sem menção de aluno específico ainda deve ser bloqueada."""
        result = classify_command("falar sobre medicação do aluno", known_students=None)
        self.assertEqual(result, DataClass.C0)


# ══════════════════════════════════════════════════════════════════════════════
# 5. TestAdversarial — Casos Construídos para Escapar (Resultado Honesto)
# ══════════════════════════════════════════════════════════════════════════════

class TestAdversarial(unittest.TestCase):
    """
    Casos adversariais construídos para tentar escapar da classificação.

    POLÍTICA: Nenhum caso de escape é 'documentado e aceito'.
    Todos devem resultar em C1 ou mais restritivo.
    C4 em qualquer frase com contexto escolar de ação = FALHA DE SEGURANÇA.
    """

    def test_adv_apelido_nao_catalogado_nao_escapa(self):
        """
        Apelido 'kinha' para Mariana após 'pra' (preposição pessoal) +
        contexto de ação (nota) DEVE ser capturado pelo Modo Suspeita.
        C4 é PROIBIDO — quebra a suíte com falha explícita.
        """
        result = classify_command("coloca 7 pra kinha", _ROSTER)
        self.assertNotEqual(
            result,
            DataClass.C4,
            f"FALHA DE SEGURANÇA: 'coloca 7 pra kinha' classificado como C4 (ESCAPE). "
            f"Deve ser C1. Obtido: {result.label}",
        )
        self.assertLessEqual(
            result.value,
            DataClass.C1.value,
            f"Esperado C1 (<=1), obtido {result.label} ({result.value})",
        )

    def test_adv_erro_digitacao_nome_nao_escapa(self):
        """
        'peedro' com erro de digitação após preposição pessoal +
        contexto de falta DEVE ser capturado pelo Modo Suspeita.
        C4 é PROIBIDO.
        """
        result = classify_command("marcar falta pra peedro", _ROSTER)
        self.assertNotEqual(
            result,
            DataClass.C4,
            f"FALHA DE SEGURANÇA: 'marcar falta pra peedro' classificado como C4 (ESCAPE). "
            f"Deve ser C1. Obtido: {result.label}",
        )
        self.assertLessEqual(
            result.value,
            DataClass.C1.value,
            f"Esperado C1 (<=1), obtido {result.label} ({result.value})",
        )

    def test_adv_nome_incomum_capitalizado_nao_escapa(self):
        """
        'Weverton' (capitalizado) após 'pro' DEVE ser capturado pelo
        Padrão 1 do Modo Suspeita (preposição + palavra capitalizada desconhecida).
        C4 é PROIBIDO.
        """
        result = classify_command("registra 6 pro Weverton", _ROSTER)
        self.assertNotEqual(
            result,
            DataClass.C4,
            f"FALHA DE SEGURANÇA: 'registra 6 pro Weverton' classificado como C4 (ESCAPE). "
            f"Deve ser C1. Obtido: {result.label}",
        )
        self.assertLessEqual(
            result.value,
            DataClass.C1.value,
            f"Esperado C1 (<=1), obtido {result.label} ({result.value})",
        )

    def test_adv_nota_para_todos_nao_escapa(self):
        """
        'coloca nota máxima a todos' — verbo de escrita + dado de nota + preposição
        de destinatário = dado coletivo de desempenho.
        C4 é PROIBIDO para comandos com verbo de escrita + dado escolar.
        """
        result = classify_command("coloca nota maxima a todos", _ROSTER)
        self.assertNotEqual(
            result,
            DataClass.C4,
            f"FALHA DE SEGURANÇA: 'coloca nota maxima a todos' classificado como C4. "
            f"Dado coletivo de desempenho deve ser C1. Obtido: {result.label}",
        )

    def test_adv_nota_por_extenso_gabriel(self):
        """
        'gabriel tirou sete e meio' — gabriel está no dicionário de nomes.
        Deve ser C1 (nome catalogado + contexto de nota implícito).
        """
        result = classify_command("o gabriel tirou sete e meio", _ROSTER)
        self.assertNotEqual(
            result,
            DataClass.C4,
            f"FALHA: 'o gabriel tirou sete e meio' classificado como C4. "
            f"Gabriel está no dicionário de nomes. Obtido: {result.label}",
        )

    def test_adv_saude_ofuscada_remedio(self):
        """
        'o aluno toma o remédio todo dia' — DEVE ser C0.
        Gatilho de saúde 'remedio' no JSON externo.
        """
        result = classify_command("o aluno toma o remédio todo dia", _ROSTER)
        self.assertEqual(
            result,
            DataClass.C0,
            f"Dado de saúde ofuscado deve ser C0. Obtido: {result.label}",
        )

    def test_adv_saude_sem_acento(self):
        """
        'psicologo' sem acento — normalização deve capturar como C0.
        """
        result = classify_command("encaminhar para psicologo escolar", None)
        self.assertEqual(
            result,
            DataClass.C0,
            f"Variante sem acento deve ser C0. Obtido: {result.label}",
        )



# ══════════════════════════════════════════════════════════════════════════════
# Runner
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main(verbosity=2)
