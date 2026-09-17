"""
test_pii_router.py — Testes Unitários do Roteador de Privacidade (LGPD)

Valida que:
1. _contains_student_pii() classifica corretamente frases com e sem PII de aluno.
2. extract_intent() sinaliza pii_detected=True/False e pii_routed_local=True/False.
3. Frases com PII NUNCA chegam a Groq/Gemini (confirmado via mock de HTTP).
4. Frases sem PII podem usar Groq/Gemini (tier livre) sem problema.
5. Ollama offline: fallback para regex funciona sem quebrar.
"""

import sys
from pathlib import Path
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from intent_parser import _contains_student_pii, extract_intent


# ─────────────────────────────────────────────────────────────────────────────
# 1. Testes da heurística _contains_student_pii()
# ─────────────────────────────────────────────────────────────────────────────

class TestPIIHeuristic:
    """Testa a heurística de detecção de PII de aluno."""

    PII_PHRASES = [
        "lança nota 9.5 para o Hugo",
        "lança nota 8 pra Ana",
        "registra falta pro João",
        "marca presença para o Carlos",
        "coloca nota 7.5 no boletim da Maria",
        "anota uma ocorrência disciplinar pro Hugo: conversa paralela",
        "preenche o diário da turma 6A",
        "atualiza nota do aluno Pedro",
        "remove falta da Ana Silva",
        "inclui falta para o estudante",
        "marcar presença para todos os alunos",
        "lançar 2 faltas pro Henrique",
        "nota 6.0 pra turma do 7B",
        "registre a frequência do Enzo",
        # As 5 frases coloquiais em minúsculas que antes vazavam (Audit Remediation):
        "coloca 8 pro hugo",
        "o hugo tirou 10 no teste",
        "pedro nao veio hoje",
        "mariana brigou no recreio",
        "anota que lucas tirou 7",
    ]

    NON_PII_PHRASES = [
        "crie 5 questões de história sobre a Revolução Francesa",
        "gere uma prova de matemática com 10 questões",
        "quais são as melhores estratégias pedagógicas para alunos com dificuldade de leitura?",
        "sugira um plano de aula sobre fotossíntese",
        "navegue para a aba de arquivos",
        "abra o diário de classe",
        "ir para a seção de relatórios",
        "qual é o desempenho médio da turma?",
        "gere um resumo do conteúdo de biologia",
        "crie uma rubrica de avaliação de redação",
    ]

    @pytest.mark.parametrize("phrase", PII_PHRASES)
    def test_pii_detected(self, phrase):
        assert _contains_student_pii(phrase) is True, (
            f"Esperava PII=True para: {phrase!r}"
        )

    @pytest.mark.parametrize("phrase", NON_PII_PHRASES)
    def test_non_pii_not_detected(self, phrase):
        assert _contains_student_pii(phrase) is False, (
            f"Esperava PII=False para: {phrase!r}"
        )

    def test_five_critical_fail_closed_phrases(self):
        """As 5 frases coloquiais em minúsculas que antes vazavam agora são bloqueadas com segurança."""
        critical = [
            "coloca 8 pro hugo",
            "o hugo tirou 10 no teste",
            "pedro nao veio hoje",
            "mariana brigou no recreio",
            "anota que lucas tirou 7"
        ]
        for phrase in critical:
            assert _contains_student_pii(phrase) is True, f"Falso negativo detectado para: {phrase}"

    def test_known_students_cross_validation(self):
        """Validação cruzada contra lista de alunos força PII mesmo para padrões atípicos."""
        roster = ["Hugo Ribeiro", "Mariana Lima", "Pedro Souza", "Lucas Santos"]
        assert _contains_student_pii("hugo saiu mais cedo", known_students=roster) is True
        assert _contains_student_pii("atendimento com o ribeiro", known_students=roster) is True
        assert _contains_student_pii("exercicio sobre verbos", known_students=roster) is False

    def test_adversarial_phrases_fail_closed(self):
        """Testes adversariais com apelidos fora do dicionário, erros de digitação e notas por extenso."""
        adversarial = [
            "atribua nota sete para o Juninho",
            "atribua conceito maximo ao Bruninho",
            "Juninho tirou oito na prova",
            "coloca 8 pro Zezinho",
            "Hugoo tirou 9 no teste",
            "atendimento individual com o aluno Welingtton",
            "nota dez para o Wanderson"
        ]
        for phrase in adversarial:
            assert _contains_student_pii(phrase) is True, f"Falso negativo adversarial detectado para: {phrase}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Testes do roteamento em extract_intent() (sem LLMs reais)
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractIntentPIIRouting:
    def _run(self, phrase):
        return extract_intent(phrase, groq_key="", gemini_key="")

    def test_nota_pii_flag(self):
        intent = self._run("lança nota 8.5 para o João")
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True
        assert intent["provider_used"] in ("regex", "ollama_local")

    def test_falta_pii_flag(self):
        intent = self._run("registra falta pro Hugo Ribeiro")
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True

    def test_presenca_pii_flag(self):
        intent = self._run("marca presença para a Ana")
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True

    def test_ocorrencia_pii_flag(self):
        intent = self._run("anota uma ocorrência disciplinar pro Hugo: conversa paralela")
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True

    def test_prova_nao_pii(self):
        intent = self._run("crie 10 questões de matemática sobre frações")
        assert intent["pii_detected"] is False
        assert intent["pii_routed_local"] is False

    def test_plano_aula_nao_pii(self):
        intent = self._run("sugira um plano de aula sobre fotossíntese para o 8º ano")
        assert intent["pii_detected"] is False
        assert intent["pii_routed_local"] is False

    def test_navegacao_nao_pii(self):
        intent = self._run("navega para a aba de arquivos")
        assert intent["pii_detected"] is False
        assert intent["pii_routed_local"] is False

    def test_pii_intent_sempre_completo(self):
        intent = self._run("lança nota 9.0 para o Pedro Silva")
        assert isinstance(intent, dict)
        for key in ("pii_detected", "pii_routed_local", "provider_used",
                    "model_used", "verbo_acao", "objeto_alvo"):
            assert key in intent, f"Campo ausente: {key}"

    def test_pii_nota_extrai_valor(self):
        intent = self._run("lança nota 7.5 para a Maria")
        assert intent["pii_detected"] is True
        nota = intent.get("nota") or float(intent.get("valor") or 0)
        assert nota == 7.5, f"Esperava nota=7.5, obteve: {nota}"

    def test_pii_falta_extrai_aluno(self):
        intent = self._run("lança falta para o Carlos Mendes")
        assert intent["pii_detected"] is True
        aluno = intent.get("aluno") or ""
        assert "carlos" in aluno.lower(), f"Esperava aluno com Carlos, obteve: {aluno}"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Garantia: PII nunca passa por cloud mesmo com chaves configuradas
# ─────────────────────────────────────────────────────────────────────────────

class TestPIICloudBlock:

    def test_pii_nao_chama_groq(self, monkeypatch):
        chamados = []

        def fake_groq(prompt, key, **kwargs):
            chamados.append(prompt)
            return None

        monkeypatch.setattr("intent_parser._call_groq_llm", fake_groq)
        intent = extract_intent(
            "lança nota 9.5 para o Hugo",
            groq_key="gsk_fakekeyxxxxxxxx",
            gemini_key=""
        )
        assert len(chamados) == 0, f"Groq não deveria ser chamado para PII. Chamadas: {len(chamados)}"
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True

    def test_pii_nao_chama_gemini(self, monkeypatch):
        chamados = []

        def fake_gemini(prompt, key, **kwargs):
            chamados.append(prompt)
            return None

        monkeypatch.setattr("intent_parser._call_gemini_llm", fake_gemini)
        intent = extract_intent(
            "registra falta pro Pedro",
            groq_key="",
            gemini_key="AIzaSyFakeKeyXxxxxxxxxx"
        )
        assert len(chamados) == 0, f"Gemini não deveria ser chamado para PII. Chamadas: {len(chamados)}"
        assert intent["pii_detected"] is True
        assert intent["pii_routed_local"] is True

    def test_nao_pii_chama_groq(self, monkeypatch):
        """Frases sem PII PODEM ir para Groq — o bloqueio é só para PII."""
        chamados = []
        resp_fake = ('{"verbo_acao":"gerar","objeto_alvo":"prova","tipo_operacao":"leitura","is_complete":true,"clarification_question":null}', "gpt-oss-120b")

        def fake_groq(prompt, key, **kwargs):
            chamados.append(prompt)
            return resp_fake

        monkeypatch.setattr("intent_parser._call_groq_llm", fake_groq)
        intent = extract_intent(
            "crie uma prova de história com 5 questões",
            groq_key="gsk_fakekeyxxxxxxxx",
            gemini_key=""
        )
        assert len(chamados) == 1, "Groq deveria ser chamado para frase sem PII"
        assert intent["pii_detected"] is False
        assert intent["pii_routed_local"] is False
        assert intent["provider_used"] == "groq"
