"""
sidecar/skills/educational_grounding_skill.py — Grounding Semântico & Ontologia Educacional Brasileira

Resolve o problema da fragilidade de seletores e jargões escolares:
1. EducationalOntology: Mapeamento ontológico de sinônimos de sistemas educacionais brasileiros
   (TOTVS RM, i-Educar, Plurall, SigaEdu, Sophia, Perseus, etc.).
2. SpatialMatrixGrounding: Resolução relacional em matrizes de alunos Linha (Aluno) x Coluna (Avaliação/Data),
   gerando seletores estáveis mesmo em tabelas legadas ou grids sem identificadores únicos.
"""

import difflib
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("EducationalGroundingSkill")


class EducationalOntology:
    """Ontologia semântica para correspondência de intenções e elementos escolares brasileiros."""

    # Categorias ontológicas fundamentais de portais escolares
    CONCEPTS: Dict[str, List[str]] = {
        "DIARIO": [
            "diario", "diario de classe", "diario online", "caderneta", "caderneta eletronica",
            "registro de aulas", "registro de classe", "registro pedagogico", "livro ponto",
            "acompanhamento pedagogico", "plano de aula", "conteudo ministrado"
        ],
        "CHAMADA": [
            "chamada", "frequencia", "frequencia escolar", "presenca", "registro de presenca",
            "falta", "faltas", "ausencia", "ausencias", "lancamento de frequencia", "folha de frequencia",
            "registro de faltas", "registro de frequencia", "lancar faltas", "lancar presenca"
        ],
        "NOTAS": [
            "nota", "notas", "avaliacao", "avaliacoes", "conceito", "conceitos", "grau", "graus",
            "media", "medias", "boletim", "recuperacao", "prova", "trabalho", "lancamento de notas",
            "digitacao de notas", "digitar notas", "fechamento de medias", "registro de notas", "lancar notas"
        ],
        "TURMAS": [
            "turma", "turmas", "classe", "classes", "ano", "anos", "serie", "series",
            "etapa", "grau", "ensino fundamental", "ensino medio", "infantil"
        ],
        "DISCIPLINAS": [
            "disciplina", "disciplinas", "materia", "materias", "componente curricular",
            "componentes curriculares", "area de conhecimento", "curriculo"
        ],
        "ALUNOS": [
            "aluno", "alunos", "estudante", "estudantes", "discente", "discentes",
            "matricula", "matriculas", "meus alunos", "lista de alunos", "chamada nominal"
        ],
        "SALVAR": [
            "salvar", "gravar", "confirmar", "enviar", "submeter", "registrar",
            "concluir", "salvar notas", "gravar alteracoes", "atualizar"
        ]
    }

    @staticmethod
    def normalize_text(text: str) -> str:
        """Remove acentos, converte para minúsculas e remove pontuações desnecessárias."""
        if not text:
            return ""
        nfkd = unicodedata.normalize("NFD", text)
        clean = "".join([c for c in nfkd if not unicodedata.combining(c)]).lower()
        clean = re.sub(r"[^\w\s]", " ", clean)
        return re.sub(r"\s+", " ", clean).strip()

    @classmethod
    def classify_concept(cls, text: str) -> Tuple[Optional[str], float]:
        """Classifica uma string de texto em um dos conceitos fundamentais com score de confiança."""
        norm_input = cls.normalize_text(text)
        if not norm_input:
            return None, 0.0

        input_tokens = set(t for t in norm_input.split() if t not in ("de", "da", "do", "e", "para", "em"))
        best_concept = None
        best_score = 0.0

        for concept, synonyms in cls.CONCEPTS.items():
            for syn in synonyms:
                # 1. Correspondência exata
                if syn == norm_input:
                    return concept, 1.0

                # 2. Correspondência por tokens sem stopwords
                syn_tokens = set(t for t in syn.split() if t not in ("de", "da", "do", "e", "para", "em"))
                if syn_tokens and syn_tokens == input_tokens:
                    return concept, 1.0

                if syn_tokens and syn_tokens.issubset(input_tokens):
                    score = 0.95
                    if score > best_score:
                        best_score = score
                        best_concept = concept

                if f" {syn} " in f" {norm_input} ":
                    score = 0.90
                    if score > best_score:
                        best_score = score
                        best_concept = concept

                # 3. Similaridade de sequência
                sim = difflib.SequenceMatcher(None, syn, norm_input).ratio()
                if sim >= 0.80 and sim > best_score:
                    best_score = sim
                    best_concept = concept

        return best_concept, round(best_score, 2)

    @classmethod
    def matches_concept(cls, text: str, target_concept: str) -> bool:
        """Verifica se o texto do elemento corresponde ao conceito alvo desejado."""
        concept, score = cls.classify_concept(text)
        return concept == target_concept.upper() and score >= 0.75


class SpatialMatrixGrounding:
    """Localizador de células em matrizes escolares (Grids de Alunos x Avaliações)."""

    @classmethod
    def fuzzy_match_student(cls, query_name: str, candidate_names: List[str]) -> Optional[Tuple[str, float]]:
        """
        Localiza o aluno mais compatível considerando abreviações, nomes do meio e acentuação.
        Ex: 'Hugo Silva' dá match com 'HUGO DA SILVA PINTO'.
        """
        norm_query = EducationalOntology.normalize_text(query_name)
        q_tokens = [t for t in norm_query.split() if len(t) >= 2]
        if not q_tokens:
            return None

        best_candidate = None
        best_score = 0.0

        for candidate in candidate_names:
            norm_cand = EducationalOntology.normalize_text(candidate)
            c_tokens = [t for t in norm_cand.split() if len(t) >= 2]

            # Todos os tokens da busca estão no candidato (ex: Hugo e Silva)
            token_matches = sum(1 for t in q_tokens if t in c_tokens or any(c.startswith(t) for c in c_tokens))
            ratio = token_matches / len(q_tokens)

            # Similaridade difflib como critério de desempate
            diff_ratio = difflib.SequenceMatcher(None, norm_query, norm_cand).ratio()
            final_score = (ratio * 0.7) + (diff_ratio * 0.3)

            if ratio == 1.0:
                final_score = max(final_score, 0.95)

            if final_score > best_score:
                best_score = final_score
                best_candidate = candidate

        if best_score >= 0.70:
            return best_candidate, round(best_score, 2)
        return None

    @classmethod
    def generate_cell_selector(
        cls,
        student_name: str,
        column_identifier: Optional[str] = None,
        column_index: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Gera a query resiliente para selecionar o input exato da célula de um aluno.
        Suporta tanto XPath relativo quanto JavaScript para execução no navegador.
        """
        clean_name = EducationalOntology.normalize_text(student_name)
        first_token = clean_name.split()[0] if clean_name else ""
        last_token = clean_name.split()[-1] if clean_name else ""

        # XPath para localizar a linha que contém o nome do aluno
        if first_token and last_token and first_token != last_token:
            xpath_row = f"//tr[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÀÈÌÒÙÃÕÂÊÎÔÛÇ', 'abcdefghijklmnopqrstuvwxyzáéíóúàèìòùãõâêîôûç'), '{first_token}') and contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÀÈÌÒÙÃÕÂÊÎÔÛÇ', 'abcdefghijklmnopqrstuvwxyzáéíóúàèìòùãõâêîôûç'), '{last_token}')]"
        else:
            xpath_row = f"//tr[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÀÈÌÒÙÃÕÂÊÎÔÛÇ', 'abcdefghijklmnopqrstuvwxyzáéíóúàèìòùãõâêîôûç'), '{clean_name}')]"

        # Alvo da coluna (índice ou seletor de input)
        if column_index is not None and column_index > 0:
            xpath_cell = f"{xpath_row}//td[{column_index}]//input"
        elif column_identifier:
            norm_col = EducationalOntology.normalize_text(column_identifier)
            xpath_cell = f"{xpath_row}//input[contains(@name, '{norm_col}') or contains(@id, '{norm_col}') or contains(@placeholder, '{norm_col}')]"
        else:
            xpath_cell = f"{xpath_row}//input[not(@type='hidden') and not(@disabled)]"

        # Script JS robusto para localizar o elemento via matching direto no DOM
        js_resolver = f"""
        (() => {{
            const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim();
            const studentQuery = {repr(clean_name)};
            const colIndex = {column_index if column_index is not None else -1};
            const colId = {repr(EducationalOntology.normalize_text(column_identifier or ''))};

            const rows = Array.from(document.querySelectorAll('tr, div[role="row"], .grid-row, .table-row'));
            for (const row of rows) {{
                const rowText = norm(row.innerText || row.textContent || '');
                if (rowText.includes(studentQuery) || (studentQuery.split(' ').every(tok => rowText.includes(tok)))) {{
                    // Aluno encontrado na linha!
                    const inputs = Array.from(row.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea, select'));
                    if (inputs.length === 0) continue;

                    if (colIndex > 0 && inputs[colIndex - 1]) {{
                        return {{ found: true, element: inputs[colIndex - 1], student: rowText.slice(0, 50) }};
                    }}
                    if (colId) {{
                        const matchInput = inputs.find(i => norm(i.name).includes(colId) || norm(i.id).includes(colId) || norm(i.getAttribute('aria-label')).includes(colId));
                        if (matchInput) return {{ found: true, element: matchInput, student: rowText.slice(0, 50) }};
                    }}
                    return {{ found: true, element: inputs[0], student: rowText.slice(0, 50) }};
                }}
            }}
            return {{ found: false }};
        }})()
        """

        return {
            "student_query": student_name,
            "column_identifier": column_identifier,
            "column_index": column_index,
            "xpath_row": xpath_row,
            "xpath_cell": xpath_cell,
            "js_resolver": js_resolver
        }
