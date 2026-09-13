"""
sidecar/student_matcher.py — Motor Unificado de Correspondência e Reconciliação em 4 Vias

Espelha e unifica os princípios de lib/rosterReconciler.ts e lib/studentMatcher.ts:
Princípio Inegociável:
1. O Portal Escolar é a fonte primária de verdade.
2. A matrícula (portal_native_id) é a chave primária estável de identidade.
3. Se houver homônimos ou nomes parecidos sem matrícula para desempate,
   o sistema NUNCA escolhe silenciosamente — retorna status='ambiguous' exigindo confirmação humana.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


def normalize_student_name(name: str) -> str:
    """Remove acentos, pontuação e normaliza caixa para comparação fonética limpa."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFD", str(name))
    no_accents = "".join([c for c in nfkd if not unicodedata.combining(c)])
    clean = re.sub(r"[^\w\s]", " ", no_accents)
    return re.sub(r"\s+", " ", clean).strip().lower()


@dataclass
class StudentCandidate:
    id: str
    name: str
    matricula: str = ""
    class_name: str = ""
    score: float = 1.0
    details: str = ""


@dataclass
class MatchResult:
    status: str                         # 'exact' | 'confident_match' | 'ambiguous' | 'not_found'
    student: Optional[StudentCandidate] = None
    candidates: List[StudentCandidate] = field(default_factory=list)
    confidence: float = 0.0
    disambiguation_prompt: Optional[str] = None


def match_student_4_ways(
    query_name: str,
    roster: List[Dict[str, Any]],
    query_matricula: Optional[str] = None,
    class_ref: Optional[str] = None,
    ambiguity_delta: float = 0.18
) -> MatchResult:
    """
    Algoritmo unificado de correspondência em 4 vias:
    1. Match Direto por Matrícula (portal_native_id): 100% determinístico e estável.
    2. Match Exato por Nome Completo Normalizado (+ Turma se disponível).
    3. Match por Substring / Token Overlap (com detecção estrita de empates).
    4. Match por Primeiro Nome / Prefixo (com retorno obrigatório de 'ambiguous' se houver > 1).
    """
    clean_query = normalize_student_name(query_name)
    clean_mat = str(query_matricula).strip() if query_matricula else ""

    if not roster or (not clean_query and not clean_mat):
        return MatchResult(
            status="not_found",
            confidence=0.0,
            disambiguation_prompt="Nenhum aluno informado ou lista vazia."
        )

    candidates_pool: List[StudentCandidate] = []
    for idx, item in enumerate(roster):
        raw_name = str(item.get("name") or item.get("nome") or "")
        raw_mat = str(item.get("matricula") or item.get("portal_native_id") or item.get("rollNumber") or item.get("id") or "")
        c_class = str(item.get("classRef") or item.get("class_name") or item.get("turma") or "")
        det = str(item.get("details") or item.get("fullText") or f"{raw_name} ({raw_mat})").strip()

        candidates_pool.append(StudentCandidate(
            id=raw_mat or f"stu_{idx}",
            name=raw_name,
            matricula=raw_mat,
            class_name=c_class,
            details=det
        ))

    # ──────────────────────────────────────────────────────────────────────────
    # VIA 1: Match Direto por Matrícula (portal_native_id)
    # ──────────────────────────────────────────────────────────────────────────
    if clean_mat:
        mat_matches = [c for c in candidates_pool if c.matricula and c.matricula == clean_mat]
        if len(mat_matches) == 1:
            return MatchResult(
                status="exact",
                student=mat_matches[0],
                candidates=mat_matches,
                confidence=1.0
            )

    # Match direto caso query_name seja a própria matrícula
    raw_query_clean = str(query_name or "").strip().lower()
    if raw_query_clean:
        direct_mat = [
            c for c in candidates_pool
            if c.matricula and c.matricula.strip().lower() == raw_query_clean
        ]
        if len(direct_mat) == 1:
            return MatchResult(
                status="exact",
                student=direct_mat[0],
                candidates=direct_mat,
                confidence=1.0
            )

    # ──────────────────────────────────────────────────────────────────────────
    # VIA 2: Match Exato por Nome Normalizado (+ Turma se informada)
    # ──────────────────────────────────────────────────────────────────────────
    exact_name_matches = [
        c for c in candidates_pool
        if normalize_student_name(c.name) == clean_query
    ]

    if class_ref and len(exact_name_matches) > 1:
        clean_cls = normalize_student_name(class_ref)
        filtered_by_class = [c for c in exact_name_matches if clean_cls in normalize_student_name(c.class_name)]
        if len(filtered_by_class) == 1:
            return MatchResult(
                status="exact",
                student=filtered_by_class[0],
                candidates=filtered_by_class,
                confidence=1.0
            )

    if len(exact_name_matches) == 1:
        return MatchResult(
            status="exact",
            student=exact_name_matches[0],
            candidates=exact_name_matches,
            confidence=1.0
        )
    elif len(exact_name_matches) > 1:
        cand_labels = [f"'{c.name}'" + (f" (#{c.matricula})" if c.matricula else "") for c in exact_name_matches]
        return MatchResult(
            status="ambiguous",
            student=None,
            candidates=exact_name_matches,
            confidence=0.5,
            disambiguation_prompt=f"Existem múltiplos alunos com o mesmo nome exato: {' ou '.join(cand_labels)}. Informe a matrícula para confirmar."
        )

    # ──────────────────────────────────────────────────────────────────────────
    # VIA 3: Substring / Token Overlap
    # ──────────────────────────────────────────────────────────────────────────
    substring_matches = []
    for c in candidates_pool:
        c_norm = normalize_student_name(c.name)
        if clean_query in c_norm or c_norm in clean_query:
            substring_matches.append(c)

    if class_ref and len(substring_matches) > 1:
        clean_cls = normalize_student_name(class_ref)
        filtered_by_class = [c for c in substring_matches if clean_cls in normalize_student_name(c.class_name)]
        if len(filtered_by_class) == 1:
            return MatchResult(
                status="exact",
                student=filtered_by_class[0],
                candidates=filtered_by_class,
                confidence=1.0
            )

    if len(substring_matches) == 1:
        return MatchResult(
            status="confident_match",
            student=substring_matches[0],
            candidates=substring_matches,
            confidence=0.90
        )
    elif len(substring_matches) > 1:
        cand_labels = [f"'{c.name}'" + (f" (#{c.matricula})" if c.matricula else "") for c in substring_matches]
        return MatchResult(
            status="ambiguous",
            student=None,
            candidates=substring_matches,
            confidence=0.5,
            disambiguation_prompt=f"Encontrei mais de um aluno correspondente: {' ou '.join(cand_labels)}. Qual deles você deseja selecionar?"
        )

    # ──────────────────────────────────────────────────────────────────────────
    # VIA 4: Primeiro Nome / Prefixo
    # ──────────────────────────────────────────────────────────────────────────
    first_token = clean_query.split()[0] if clean_query else ""
    if len(first_token) >= 2:
        first_token_matches = [
            c for c in candidates_pool
            if normalize_student_name(c.name).split()[0] == first_token
        ]
        if len(first_token_matches) == 1:
            return MatchResult(
                status="confident_match",
                student=first_token_matches[0],
                candidates=first_token_matches,
                confidence=0.85
            )
        elif len(first_token_matches) > 1:
            cand_labels = [f"'{c.name}'" + (f" (#{c.matricula})" if c.matricula else "") for c in first_token_matches]
            return MatchResult(
                status="ambiguous",
                student=None,
                candidates=first_token_matches,
                confidence=0.5,
                disambiguation_prompt=f"Encontrei {len(first_token_matches)} alunos com o primeiro nome '{first_token.capitalize()}': {' ou '.join(cand_labels)}. Por favor, informe o nome completo ou a matrícula."
            )

    return MatchResult(
        status="not_found",
        student=None,
        candidates=[],
        confidence=0.0,
        disambiguation_prompt=f"Não encontrei nenhum aluno com nome similar a '{query_name}' nesta turma."
    )
