"""
hypocoristic_matcher.py — Resolvedor de Hipocorísticos e Apelidos Regionais (PT-BR)

Mapeia apelidos e formas carinhosas/abreviadas da língua portuguesa brasileira
para os respectivos nomes de registro formal, facilitando comandos em linguagem natural
da professora (ex: "nota pro Zé" -> "José", "falta pra Duda" -> "Eduarda").
"""

import unicodedata
from typing import Dict, List, Optional, Set, Tuple


def _normalize_name(name: str) -> str:
    """Remove acentos, pontuações e converte para minúsculas."""
    if not name:
        return ""
    nfkd = unicodedata.normalize("NFD", name)
    clean = "".join(c for c in nfkd if unicodedata.category(c) != "Mn")
    return clean.lower().strip()


# Mapeamento canônico bidirecional de hipocorísticos para nomes formais
HYPOCORISTIC_MAP: Dict[str, List[str]] = {
    "ze": ["jose"],
    "zezinho": ["jose"],
    "zeco": ["jose"],
    "duda": ["eduarda", "maria eduarda"],
    "dudu": ["eduardo", "carlos eduardo"],
    "du": ["eduardo", "eduarda"],
    "rafa": ["rafael", "rafaela", "raphael"],
    "rafinha": ["rafael", "rafaela"],
    "chico": ["francisco"],
    "chiquinho": ["francisco"],
    "chiquinha": ["francisca"],
    "beto": ["roberto", "alberto", "carlos roberto"],
    "bel": ["isabela", "isabel", "anabel"],
    "bela": ["isabela", "isabel", "gabriela"],
    "isa": ["isabela", "isabel", "isadora"],
    "gabi": ["gabriel", "gabriela"],
    "biel": ["gabriel"],
    "gui": ["guilherme", "guilhermina"],
    "leo": ["leonardo", "leonor"],
    "manu": ["manuela", "emanuel", "emanuela", "manoel"],
    "lulu": ["luisa", "luiza", "lucas", "luciana"],
    "lu": ["luisa", "luiza", "lucas", "luciana", "luis", "luiz"],
    "bia": ["beatriz", "bianca"],
    "theo": ["teodoro", "matheus", "mateus"],
    "te": ["teodoro", "teresa", "tereza"],
    "pepe": ["pedro"],
    "pedrinho": ["pedro"],
    "nando": ["fernando", "luiz fernando"],
    "nanda": ["fernanda"],
    "cacau": ["claudia", "claudio"],
    "dani": ["daniel", "daniela", "danielle"],
    "ju": ["julia", "juliana", "juliano", "julio"],
    "juju": ["julia", "juliana"],
    "tati": ["tatiana", "tatiane"],
    "tonho": ["antonio", "marco antonio"],
    "toninho": ["antonio"],
    "zezao": ["jose"],
    "neto": ["antonio neto", "joao neto"],
    "caio": ["caio"],
    "vivi": ["viviane", "vivian", "vitoria"],
    "vic": ["victor", "vitor", "victoria", "vitoria"],
}


def get_formal_candidates(nickname: str) -> List[str]:
    """Retorna os nomes formais associados a um hipocorístico conhecido."""
    clean = _normalize_name(nickname)
    return HYPOCORISTIC_MAP.get(clean, [clean])


def _phonetic_pt_br(name: str) -> str:
    """
    Gera representação fonética simplificada para nomes em Português do Brasil.
    Normaliza dígrafos e sons equivalentes (ph->f, th->t, ch/x->x, z/ç/c->s).
    """
    s = _normalize_name(name)
    if not s:
        return ""

    s = s.replace("ph", "f").replace("th", "t").replace("y", "i").replace("w", "v")
    s = s.replace("ch", "x")
    s = s.replace("ç", "s")

    out = []
    for i, ch in enumerate(s):
        if ch == "c":
            next_ch = s[i + 1] if i + 1 < len(s) else ""
            if next_ch in ("e", "i"):
                out.append("s")
            else:
                out.append("k")
        elif ch == "z":
            out.append("s")
        else:
            out.append(ch)
    s = "".join(out)

    collapsed = []
    prev = ""
    for ch in s:
        if ch == prev and ch not in ("a", "e", "i", "o", "u"):
            continue
        collapsed.append(ch)
        prev = ch

    return "".join(collapsed)


def _damerau_levenshtein(s1: str, s2: str) -> int:
    """Calcula a distância de Damerau-Levenshtein para tolerância a pequenos erros de digitação."""
    d: Dict[Tuple[int, int], int] = {}
    len1, len2 = len(s1), len(s2)
    for i in range(-1, len1 + 1):
        d[(i, -1)] = i + 1
    for j in range(-1, len2 + 1):
        d[(-1, j)] = j + 1

    for i in range(len1):
        for j in range(len2):
            cost = 0 if s1[i] == s2[j] else 1
            d[(i, j)] = min(
                d[(i - 1, j)] + 1,
                d[(i, j - 1)] + 1,
                d[(i - 1, j - 1)] + cost
            )
            if i > 0 and j > 0 and s1[i] == s2[j - 1] and s1[i - 1] == s2[j]:
                d[(i, j)] = min(d[(i, j)], d[(i - 2, j - 2)] + cost)

    return d[(len1 - 1, len2 - 1)]


def match_student_with_hypocoristics(
    query_name: str,
    roster_names: List[str]
) -> Tuple[Optional[str], float]:
    """
    Localiza o aluno na lista do portal escolar considerando hipocorísticos,
    equivalências fonéticas PT-BR e tolerância a pequenos erros de digitação.
    Retorna (nome_encontrado_no_roster, confianca) ou (None, 0.0).
    """
    if not query_name or not roster_names:
        return None, 0.0

    clean_q = _normalize_name(query_name)
    possible_formals = get_formal_candidates(clean_q)

    # 1. Correspondência exata direta
    for r in roster_names:
        clean_r = _normalize_name(r)
        if clean_q == clean_r:
            return r, 1.0

    # 2. Correspondência exata via hipocorístico (ex: "Zé" -> "José" em "José da Silva")
    for formal in possible_formals:
        for r in roster_names:
            clean_r = _normalize_name(r)
            r_tokens = clean_r.split()
            if formal in r_tokens or (len(r_tokens) > 0 and r_tokens[0] == formal):
                return r, 0.95

    # 3. Correspondência como prefixo de primeiro nome (ex: "Rafa" em "Rafael Santos")
    for r in roster_names:
        clean_r = _normalize_name(r)
        first_name = clean_r.split()[0] if clean_r.split() else ""
        if len(clean_q) >= 3 and first_name.startswith(clean_q):
            return r, 0.90

    # 4. Substring no nome completo (ex: "Eduarda" em "Maria Eduarda")
    for formal in possible_formals:
        for r in roster_names:
            clean_r = _normalize_name(r)
            if formal in clean_r:
                return r, 0.85

    # 5. Correspondência fonética PT-BR no primeiro nome (ex: "Jozé" -> "José", "Alise" -> "Alice")
    phon_q = _phonetic_pt_br(clean_q)
    if len(phon_q) >= 3:
        for r in roster_names:
            clean_r = _normalize_name(r)
            first_name = clean_r.split()[0] if clean_r.split() else ""
            if _phonetic_pt_br(first_name) == phon_q:
                return r, 0.88

    # 6. Tolerância de digitação (Damerau-Levenshtein <= 1 em nomes >= 4 letras)
    if len(clean_q) >= 4:
        for r in roster_names:
            clean_r = _normalize_name(r)
            first_name = clean_r.split()[0] if clean_r.split() else ""
            if len(first_name) >= 4 and _damerau_levenshtein(clean_q, first_name) <= 1:
                return r, 0.80

    return None, 0.0
