"""
pedagogical_anomaly_guardian.py — Guardião Estatístico Curricular (Teacher AI)

Analisa lotes de notas e frequências em tempo real para detectar discrepâncias estatísticas,
outliers extremos e possíveis inversões de coluna ou digitação acidental, gerando
avisos acolhedores e pedagógicos para a professora antes da submissão final.
"""

import math
from typing import Any, Dict, List, Optional, Tuple


def calculate_statistics(numbers: List[float]) -> Dict[str, float]:
    """Calcula média, desvio padrão, mínimo e máximo de uma lista numérica."""
    if not numbers:
        return {"count": 0, "mean": 0.0, "std_dev": 0.0, "min": 0.0, "max": 0.0}

    n = len(numbers)
    mean = sum(numbers) / n
    variance = sum((x - mean) ** 2 for x in numbers) / max(n - 1, 1) if n > 1 else 0.0
    std_dev = math.sqrt(variance)

    return {
        "count": n,
        "mean": round(mean, 2),
        "std_dev": round(std_dev, 2),
        "min": min(numbers),
        "max": max(numbers)
    }


def analyze_grade_batch(grades: List[float]) -> Dict[str, Any]:
    """
    Avalia a plausibilidade estatística de um lote de notas escolares.
    Retorna diagnóstico e mensagem amigável se houver anomalia.
    """
    if not grades:
        return {"has_anomaly": False, "stats": {}, "friendly_notice": None}

    stats = calculate_statistics(grades)
    mean = stats["mean"]
    std_dev = stats["std_dev"]
    n = int(stats["count"])

    anomalies = []
    friendly_notice = None

    # 1. Detecção de Outliers (> 3 desvios padrão) em turmas com pelo menos 5 notas
    outliers = []
    if n >= 5 and std_dev > 0.5:
        for idx, g in enumerate(grades):
            z_score = abs(g - mean) / std_dev
            if z_score >= 2.8:
                outliers.append({"index": idx, "value": g, "z_score": round(z_score, 2)})

    if outliers:
        anomalies.append("outliers_detected")

    # 2. Média atipicamente baixa (ex: menor que 3.5 em turma inteira)
    if n >= 8 and mean < 3.5:
        anomalies.append("low_class_average")
        friendly_notice = (
            f"Professora, notei que a média desta atividade ficou em {mean:.1f}, "
            "um valor bem abaixo do habitual. Gostaria de revisar as notas antes de enviar para o portal? 📚✨"
        )

    # 3. Taxa de reprovação em massa (> 60% com nota < 5.0)
    reprovados = sum(1 for g in grades if g < 5.0)
    if n >= 8 and (reprovados / n) >= 0.65:
        anomalies.append("mass_failure_rate")
        if not friendly_notice:
            friendly_notice = (
                f"Atenção: mais de 65% dos estudantes ({reprovados}/{n}) ficaram abaixo de 5.0. "
                "Pode ter ocorrido inversão de critérios ou coluna. Vale uma conferida rápida! 🔍"
            )

    return {
        "has_anomaly": len(anomalies) > 0,
        "anomaly_types": anomalies,
        "outliers": outliers,
        "stats": stats,
        "friendly_notice": friendly_notice
    }


def evaluate_relational_rule(
    rule_dict: Dict[str, Any],
    students_data: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Avalia regras pedagógicas relacionais locais sem envio de PII para a nuvem.
    Exemplos de regras suportadas:
    - Média ponderada: {"type": "weighted_average", "weights": {"prova": 2.0, "trabalho": 1.0}}
    - Filtro de corte: {"type": "attendance_cutoff", "min_attendance_pct": 75.0}
    Retorna resultados calculados e alunos elegíveis.
    """
    rule_type = rule_dict.get("type", "weighted_average")
    results = []

    if rule_type == "weighted_average":
        weights = rule_dict.get("weights", {"prova": 1.0, "trabalho": 1.0})
        total_weight = sum(weights.values()) or 1.0
        for s in students_data:
            sid = s.get("student_id", "anon")
            grades = s.get("grades", {})
            weighted_sum = sum(grades.get(k, 0.0) * w for k, w in weights.items())
            final_grade = round(weighted_sum / total_weight, 2)
            results.append({"student_id": sid, "final_grade": final_grade})

    elif rule_type == "attendance_cutoff":
        min_pct = float(rule_dict.get("min_attendance_pct", 75.0))
        for s in students_data:
            sid = s.get("student_id", "anon")
            att_pct = float(s.get("attendance_pct", 100.0))
            eligible = att_pct >= min_pct
            results.append({"student_id": sid, "attendance_pct": att_pct, "eligible": eligible})

    return {
        "rule_type": rule_type,
        "processed_count": len(results),
        "results": results
    }

