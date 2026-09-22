"""
data_classification.py — Taxonomia de Risco de Dados (Cadeado de Segurança Final)
═══════════════════════════════════════════════════════════════════════════════════
Classifica um comando da professora em 5 classes de sensibilidade de dados:

  Classe 0 (C0) — Dado de Saúde / LGPD Especial
      Termos de condição médica, psicológica, vulnerabilidade socioeconômica
      ou dado sensível LGPD amplo (CPF, endereço, etc.).
      → BLOQUEIO ABSOLUTO. Nunca vai para cloud nem pseudonimização.

  Classe 1 (C1) — Texto Livre com Referência a Aluno
      Narrativa comportamental, observação aberta, qualquer texto que mencione
      um aluno de forma não-estruturada.
      → Trilho 1 Local apenas (Ollama → regex). Cloud terminantemente proibido.

  Classe 2 (C2) — Desempenho Acadêmico Estruturado
      Dado de nota+nome ou falta+nome em formato de comando de ação
      ("coloca 8 pro hugo", "mariana faltou hoje").
      → Pseudonimização obrigatória antes de qualquer chamada cloud.
      → Se pseudonimização falhar (known_students indisponível) → degrada C1.

  Classe 3 (C3) — Identificação Pura (Consulta/Leitura)
      Consulta de dado de aluno identificado por nome, sem ação de escrita
      ("qual a nota do pedro", "quantas faltas o hugo tem").
      → Pseudonimização obrigatória antes de qualquer chamada cloud.
      → Se pseudonimização falhar → degrada C1.

  Classe 4 (C4) — Conteúdo Pedagógico Genérico
      Criação de provas, sugestão de atividades, planos de aula, navegação.
      Nenhuma referência a aluno identificável.
      → Cloud livre (Groq / Gemini) sem restrição.

PRINCÍPIO FAIL-CLOSED: Na dúvida, sempre a classe mais restritiva.

Autor: Cadeado de Segurança — Teacher AI
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from enum import IntEnum
from pathlib import Path
from typing import List, Optional

# ─── Localização do arquivo de configuração externo ───────────────────────────
_CONFIG_DIR = Path(__file__).parent / "config"
_CLASS0_TRIGGERS_PATH = _CONFIG_DIR / "class0_triggers.json"

# Cache em módulo (carregado uma vez, não recarregado a cada chamada)
_class0_triggers_flat: Optional[List[str]] = None


def _load_class0_triggers() -> List[str]:
    """
    Carrega e achata o dicionário de termos-gatilho de Classe 0 do JSON externo.
    Retorna lista normalizada (sem acento, minúsculas).
    Falha no carregamento → lista vazia (fail-safe: melhor que KeyError).
    """
    global _class0_triggers_flat
    if _class0_triggers_flat is not None:
        return _class0_triggers_flat

    try:
        with open(_CLASS0_TRIGGERS_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        _class0_triggers_flat = []
        return _class0_triggers_flat

    flat: List[str] = []
    for category, terms in raw.items():
        if category.startswith("_"):  # ignora comentários
            continue
        for term in terms:
            normalized = _normalize(term)
            if normalized:
                flat.append(normalized)

    _class0_triggers_flat = flat
    return _class0_triggers_flat


def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculas para comparação robusta."""
    nfd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfd if not unicodedata.combining(c)).lower().strip()


# ─── Enum de Classificação ────────────────────────────────────────────────────

class DataClass(IntEnum):
    """
    Taxonomia de risco de dados do Teacher AI.
    IntEnum para que C0 < C1 < C2 < C3 < C4 (mais restritivo = menor valor).
    """
    C0 = 0  # Dado de Saúde / LGPD Especial → Bloqueio absoluto
    C1 = 1  # Texto livre com aluno → Local somente
    C2 = 2  # Desempenho estruturado (nota+nome, falta+nome) → Pseudonimiza → Cloud
    C3 = 3  # Identificação pura (consulta/leitura com nome) → Pseudonimiza → Cloud
    C4 = 4  # Pedagógico genérico → Cloud livre

    @property
    def label(self) -> str:
        _labels = {
            0: "SAÚDE/LGPD_ESPECIAL",
            1: "TEXTO_LIVRE_ALUNO",
            2: "DESEMPENHO_ESTRUTURADO",
            3: "IDENTIFICAÇÃO_PURA",
            4: "PEDAGÓGICO_GENÉRICO",
        }
        return _labels[self.value]

    @property
    def cloud_allowed(self) -> bool:
        """True somente se a cloud pode receber o dado (com ou sem pseudonimização)."""
        return self.value >= 2

    @property
    def requires_pseudonymization(self) -> bool:
        """True para C2 e C3 — pseudonimização é obrigatória antes de cloud."""
        return self.value in (2, 3)

    @property
    def allow_local_llm(self) -> bool:
        """True para C1 e acima — Ollama pode processar."""
        return self.value >= 1

    def description(self) -> str:
        _descs = {
            0: "Dado de saúde, condição médica, vulnerabilidade ou LGPD especial. BLOQUEIO ABSOLUTO.",
            1: "Texto livre mencionando aluno identificável. Somente processamento local.",
            2: "Dado de desempenho estruturado (nota+nome ou falta+nome). Pseudonimização obrigatória.",
            3: "Consulta de identificação de aluno (leitura). Pseudonimização obrigatória.",
            4: "Conteúdo pedagógico genérico sem dado pessoal. Cloud livre.",
        }
        return _descs[self.value]


# ─── Padrões auxiliares ────────────────────────────────────────────────────────

# Verbos de ação de escrita de nota/falta (indicam C2)
_WRITE_VERBS = re.compile(
    r"\b(lança|lançar|lance|coloca|colocar|bota|botar|registra|registrar|"
    r"atribua|atribuir|anota|anotar|marca|marcar|adiciona|adicionar|insere|inserir|"
    r"atualiza|atualizar|muda|mudar|altera|alterar|inclui|incluir)\b",
    re.IGNORECASE,
)

# Verbos de consulta/leitura (indicam C3 quando acompanhados de nome)
_READ_VERBS = re.compile(
    r"\b(qual|quais|quanto|quantos|quantas|mostra|mostrar|exibe|exibir|"
    r"ver|veja|vê|busca|buscar|consulta|consultar|lista|listar|abre|abrir)\b",
    re.IGNORECASE,
)

# Indicadores de nota (número ou por extenso)
_GRADE_PATTERN = re.compile(
    r"\b(10|[0-9](?:[.,][0-9]+)?|zero|um|dois|tr[eê]s|quatro|cinco|seis|"
    r"sete|oito|nove|dez|m[aá]xim[ao]|m[ií]nim[ao])\b",
    re.IGNORECASE,
)

# Indicadores de falta/presença
_ATTENDANCE_WORDS = re.compile(
    r"\b(falta|faltas|faltou|faltaram|ausente|ausência|presença|"
    r"frequencia|frequência|nao veio|não veio|atrasou)\b",
    re.IGNORECASE,
)

# Palavras que indicam NOTA explicitamente
_GRADE_NOUNS = re.compile(
    r"\b(nota|notas|conceito|avaliação|avaliacao|prova|teste|trabalho)\b",
    re.IGNORECASE,
)

# Padrão de texto livre longo (C1 se > threshold de palavras E contém nome)
_NARRATIVE_THRESHOLD = 8  # palavras


def _has_grade_context(text_lower: str) -> bool:
    """
    True se o texto parece conter dado estruturado de nota (C2/C3).
    Detecta padrão (verbo_ação + nota/falta) ou (nota_substantivo + número).
    """
    cleaned = re.sub(
        r"\b\d+\s*(?:quest[õo]es|perguntas|itens|exerc[íi]cios|atividades|"
        r"pontos|minutos|min|horas|dias|ano|anos)\b",
        "",
        text_lower,
    )
    has_grade_num = bool(_GRADE_PATTERN.search(cleaned))
    has_grade_noun = bool(_GRADE_NOUNS.search(cleaned))
    has_attendance = bool(_ATTENDANCE_WORDS.search(cleaned))
    has_write_verb = bool(_WRITE_VERBS.search(cleaned))

    if has_write_verb and (has_grade_num or has_attendance):
        return True
    if has_grade_noun and has_grade_num:
        return True
    if has_attendance:
        return True
    return False


def _has_student_name(
    text_lower: str,
    known_students: Optional[List[str]],
    tokens: set,
) -> bool:
    """
    True se o texto contém referência a um aluno específico.
    Usa lista real da turma (Camada 0) como critério primário.
    """
    # Importação local para evitar circular import com intent_parser
    from intent_parser import _COMMON_BRAZILIAN_FIRST_NAMES  # type: ignore

    if known_students:
        for st in known_students:
            if not st:
                continue
            st_norm = _normalize(str(st))
            st_parts = [p for p in re.split(r"\W+", st_norm) if len(p) >= 3]
            for part in st_parts:
                if part in tokens or part in text_lower:
                    return True

    # Fallback: dicionário de nomes brasileiros comuns
    if tokens & _COMMON_BRAZILIAN_FIRST_NAMES:
        return True

    return False


def _is_narrative(text: str) -> bool:
    """
    True se o texto parece narrativo/dissertativo (muitas palavras → C1).
    Heurística: mais de _NARRATIVE_THRESHOLD palavras sem padrão de comando.
    """
    words = re.split(r"\s+", text.strip())
    if len(words) >= _NARRATIVE_THRESHOLD:
        # Texto longo sem verbo de ação claro → narrativa
        if not _WRITE_VERBS.search(text) and not _READ_VERBS.search(text):
            return True
    return False


# ─── Modo Suspeita (Fail-Closed para Nomes Não Catalogados) ───────────────────

# Palavras que DEFINITIVAMENTE não são nomes após preposições pessoais.
# Qualquer palavra após preposição que NÃO esteja neste conjunto → suspeita → C1.
_DEFINITIVE_NON_NAMES_AFTER_PREP: set = {
    # Coletivos e entidades escolares
    "todos", "todas", "turma", "classe", "escola", "colegio", "grupo", "time", "equipe",
    # Funções e papéis (genéricos)
    "professor", "professora", "aluno", "aluna", "estudante", "estudantes",
    "alunos", "alunas", "responsavel", "diretor", "diretora",
    "coordenador", "coordenadora", "secretaria",
    # Interface e sistema
    "portal", "sistema", "painel", "diario", "relatorio", "tabela", "tela",
    "conteudo", "pagina", "aba", "arquivo", "arquivos", "secao",
    # Dados educacionais genéricos (substantivos)
    "nota", "notas", "falta", "faltas", "presenca", "frequencia", "boletim",
    "conceito", "avaliacao", "prova", "teste", "trabalho", "atividade",
    "atividades", "tarefa", "tarefas", "exercicio", "exercicios",
    "redacao", "texto", "projeto", "lista",
    # Tempo e calendário
    "semana", "mes", "trimestre", "bimestre", "ano", "semestre", "periodo",
    "hoje", "amanha", "segunda", "terca", "quarta", "quinta", "sexta",
    "sabado", "domingo", "dia",
    # Componentes curriculares
    "matematica", "portugues", "historia", "ciencias", "ingles", "geografia",
    "artes", "educacao", "fisica", "quimica", "biologia", "literatura",
    # Artigos e partículas gramaticais
    "que", "o", "a", "os", "as", "um", "uma", "uns", "umas",
    # Outros substantivos comuns não-nomes
    "sala", "tema", "livro", "material", "assunto", "aula", "modulo", "capitulo",
}

# Preposição + palavra capitalizada → forte sinal de nome próprio desconhecido
_CAPITALIZED_AFTER_PREP = re.compile(
    r"\b(?:pro|pra|para\s+o|para\s+a|ao)\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][a-záéíóúâêîôûãõç]{2,})"
)

# Preposição + qualquer palavra alfabética (case-insensitive, no texto normalizado)
_ANY_WORD_AFTER_PREP = re.compile(
    r"\b(?:pro|pra|para\s+o|para\s+a|ao|a)\s+([a-zaéíóúâêîôûãõç]{3,12})\b"
)

# Preposições pessoais usadas para Padrão 3
_PERSONAL_PREPS_PATTERN = re.compile(
    r"\b(?:pro|pra|para\s+o|para\s+a|ao|a)\s+",
    re.IGNORECASE,
)


def _has_suspicious_person_reference(text: str, lower: str) -> bool:
    """
    MODO SUSPEITA — Detecta referências a pessoa mesmo quando o nome não está
    no roster nem no dicionário de nomes brasileiros.

    PRINCÍPIO: Ausência de reconhecimento != 'não é nome'.
    Ausência de reconhecimento == 'pode ser nome não catalogado → C1'.

    Padrão 1: preposição + palavra CAPITALIZADA (qualquer não-stopword)
        'pro Weverton', 'pra Kinha' → nome próprio desconhecido → suspeito

    Padrão 2: preposição + palavra minúscula desconhecida + CONTEXTO ESCOLAR
        'coloca 7 pra kinha', 'marcar falta pra peedro' → suspeito

    Padrão 3: verbo de escrita + dado coletivo + preposição de destinatário
        'coloca nota maxima a todos' → dado coletivo de desempenho → suspeito
    """
    # ── Padrão 1: texto ORIGINAL (case-sensitive) ─────────────────────────────
    cap_match = _CAPITALIZED_AFTER_PREP.search(text)
    if cap_match:
        word = _normalize(cap_match.group(1))
        if word not in _DEFINITIVE_NON_NAMES_AFTER_PREP:
            return True

    # ── Padrão 2: texto normalizado + contexto escolar ────────────────────────
    for match in _ANY_WORD_AFTER_PREP.finditer(lower):
        word = match.group(1)
        if word in _DEFINITIVE_NON_NAMES_AFTER_PREP:
            continue
        if (
            _has_grade_context(lower)
            or _ATTENDANCE_WORDS.search(lower)
            or _WRITE_VERBS.search(lower)
        ):
            return True

    # ── Padrão 3: dado coletivo de desempenho com destinatário implícito ──────
    if _WRITE_VERBS.search(lower) and _has_grade_context(lower):
        if _PERSONAL_PREPS_PATTERN.search(lower):
            return True

    return False




# ─── Função Principal ─────────────────────────────────────────────────────────

def classify_command(
    text: str,
    known_students: Optional[List[str]] = None,
) -> DataClass:
    """
    Classifica o texto do comando da professora em uma das 5 classes de risco.

    PRINCÍPIO FAIL-CLOSED: Em caso de incerteza, retorna a classe mais restritiva.

    Parâmetros
    ----------
    text : str
        Comando bruto digitado pela professora.
    known_students : list[str] | None
        Lista de nomes reais dos alunos da turma ativa (via Supabase/localDB).
        Se None (Supabase offline), a Camada 0 fica desativada mas as demais
        camadas continuam operando. Para C2/C3, None força degradação para C1
        (pseudonimização impossível sem a lista completa).

    Retorno
    -------
    DataClass
        A classe de risco mais restritiva que se aplica ao texto.
    """
    if not text or not text.strip():
        return DataClass.C4  # Texto vazio → pedagógico (sem dado)

    lower = _normalize(text)
    tokens: set = set(re.split(r"\W+", lower))
    tokens.discard("")

    # ══════════════════════════════════════════════════════════════════════════
    # PASSO 1 — Verificação de Gatilhos de Classe 0 (LGPD Especial / Saúde)
    # Feita ANTES de qualquer outra classificação. Match → retorno imediato C0.
    # ══════════════════════════════════════════════════════════════════════════
    triggers = _load_class0_triggers()
    for trigger in triggers:
        # Triggers com espaço: buscar como substring normalizada
        if " " in trigger:
            if trigger in lower:
                return DataClass.C0
        else:
            if trigger in tokens:
                return DataClass.C0

    # ══════════════════════════════════════════════════════════════════════════
    # PASSO 2 — Detectar presença de nome de aluno identificável
    # ══════════════════════════════════════════════════════════════════════════
    has_name = _has_student_name(lower, known_students, tokens)

    if not has_name:
        # ── MODO SUSPEITA: mesmo sem nome catalogado, verificar padrões sintáticos ──
        # Ausência de reconhecimento NÃO pode significar "assumir que não é nome".
        # Deve significar "pode ser nome não catalogado → C1 (máxima cautela)".
        if _has_suspicious_person_reference(text, lower):
            return DataClass.C1
        # Sem nome E sem padrão suspeito → pedagógico seguro
        return DataClass.C4


    # ══════════════════════════════════════════════════════════════════════════
    # PASSO 3 — Com nome: determinar C1, C2 ou C3
    # ══════════════════════════════════════════════════════════════════════════

    # C1 — Texto longo/narrativo (observação comportamental aberta)
    if _is_narrative(text):
        return DataClass.C1

    # C2 — Dado de desempenho + verbo de escrita/ação (implica mudança de dado)
    if _has_grade_context(lower) and _WRITE_VERBS.search(lower):
        # Sem known_students → pseudonimização impossível → degrada C1
        if known_students is None:
            return DataClass.C1
        return DataClass.C2

    # C2 — Dado de presença/falta + verbo de ação
    if _ATTENDANCE_WORDS.search(lower) and _WRITE_VERBS.search(lower):
        if known_students is None:
            return DataClass.C1
        return DataClass.C2

    # C2 — Dado de desempenho sem verbo explícito (implícito pelo contexto)
    if _has_grade_context(lower):
        if known_students is None:
            return DataClass.C1
        return DataClass.C2

    # C3 — Consulta/leitura de dado de aluno com nome
    if _READ_VERBS.search(lower):
        if known_students is None:
            return DataClass.C1
        return DataClass.C3

    # C1 — Fallback conservador: nome presente mas sem estrutura clara
    # (ex: "o hugo" sem mais contexto, frases ambíguas)
    return DataClass.C1
