"""
universal_schema_normalizer.py — Esquema Canônico Universal de Dados Escolares (Babel de Portais)

Fornece uma camada de tradução bidirecional entre as entidades canônicas do Teacher AI
e as diferentes nomenclaturas e estruturas proprietárias de cada portal escolar:
- i-Educar (etapa, módulo, falta_justificada)
- SED-SP (bimestre, tipo_aula, frequencia)
- Machado Sobrinho / Painel do Aluno (etapa, pauta, avaliacao)
- Plurall / SomOS (ciclo, periodo, presenca)
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class CanonicalAction(str, Enum):
    POST_GRADE = "post_grade"
    RECORD_ATTENDANCE = "record_attendance"
    POST_CLASS_CONTENT = "post_class_content"
    READ_ROSTER = "read_roster"
    NAVIGATE_SECTION = "navigate_section"


class CanonicalPeriod(str, Enum):
    BIMESTER_1 = "1º Bimestre"
    BIMESTER_2 = "2º Bimestre"
    BIMESTER_3 = "3º Bimestre"
    BIMESTER_4 = "4º Bimestre"
    TRIMESTER_1 = "1º Trimestre"
    TRIMESTER_2 = "2º Trimestre"
    TRIMESTER_3 = "3º Trimestre"
    ANNUAL = "Anual"


class CanonicalStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    ABSENT_JUSTIFIED = "absent_justified"


@dataclass
class CanonicalTask:
    action: CanonicalAction
    student_name: Optional[str] = None
    class_id: Optional[str] = None
    discipline: Optional[str] = None
    period: Optional[CanonicalPeriod] = None
    numeric_value: Optional[float] = None
    status_value: Optional[CanonicalStatus] = None
    text_content: Optional[str] = None
    portal_id: Optional[str] = None
    raw_payload: Dict[str, Any] = field(default_factory=dict)


class BasePortalAdapter:
    portal_id: str = "generic"

    def to_canonical(self, raw: Dict[str, Any]) -> CanonicalTask:
        raise NotImplementedError

    def from_canonical(self, task: CanonicalTask) -> Dict[str, Any]:
        raise NotImplementedError


class IeducarAdapter(BasePortalAdapter):
    portal_id = "ieducar"

    def to_canonical(self, raw: Dict[str, Any]) -> CanonicalTask:
        raw_acao = (raw.get("acao") or raw.get("tipo_operacao") or "").lower()
        if "nota" in raw_acao or "avaliacao" in raw_acao:
            action = CanonicalAction.POST_GRADE
        elif "falta" in raw_acao or "frequencia" in raw_acao or "chamada" in raw_acao:
            action = CanonicalAction.RECORD_ATTENDANCE
        elif "conteudo" in raw_acao or "pauta" in raw_acao:
            action = CanonicalAction.POST_CLASS_CONTENT
        else:
            action = CanonicalAction.NAVIGATE_SECTION

        period_raw = str(raw.get("modulo") or raw.get("etapa") or "")
        period = CanonicalPeriod.BIMESTER_1 if "1" in period_raw else None

        return CanonicalTask(
            action=action,
            student_name=raw.get("aluno") or raw.get("nome_aluno"),
            class_id=raw.get("turma") or raw.get("turma_id"),
            discipline=raw.get("componente_curricular") or raw.get("disciplina"),
            period=period,
            numeric_value=float(raw["nota"]) if "nota" in raw and raw["nota"] is not None else None,
            status_value=CanonicalStatus.ABSENT if raw.get("falta") else CanonicalStatus.PRESENT,
            portal_id=self.portal_id,
            raw_payload=raw
        )

    def from_canonical(self, task: CanonicalTask) -> Dict[str, Any]:
        return {
            "portal": "ieducar",
            "tipo_operacao": "lancar_nota" if task.action == CanonicalAction.POST_GRADE else "lancar_falta",
            "nome_aluno": task.student_name,
            "turma_id": task.class_id,
            "modulo": "1" if task.period == CanonicalPeriod.BIMESTER_1 else "geral",
            "nota": task.numeric_value,
            "falta_justificada": task.status_value == CanonicalStatus.ABSENT_JUSTIFIED
        }


class SedSpAdapter(BasePortalAdapter):
    portal_id = "sed_sp"

    def to_canonical(self, raw: Dict[str, Any]) -> CanonicalTask:
        raw_acao = (raw.get("tipo") or raw.get("acao") or "").lower()
        action = CanonicalAction.POST_GRADE if "nota" in raw_acao else CanonicalAction.RECORD_ATTENDANCE
        return CanonicalTask(
            action=action,
            student_name=raw.get("estudante") or raw.get("aluno"),
            class_id=raw.get("classe") or raw.get("turma"),
            discipline=raw.get("disciplina"),
            period=CanonicalPeriod.BIMESTER_1 if "1" in str(raw.get("bimestre")) else None,
            numeric_value=float(raw["nota"]) if "nota" in raw and raw["nota"] is not None else None,
            status_value=CanonicalStatus.ABSENT if raw.get("ausencia") else CanonicalStatus.PRESENT,
            portal_id=self.portal_id,
            raw_payload=raw
        )

    def from_canonical(self, task: CanonicalTask) -> Dict[str, Any]:
        return {
            "portal": "sed_sp",
            "estudante": task.student_name,
            "classe": task.class_id,
            "bimestre": 1 if task.period == CanonicalPeriod.BIMESTER_1 else None,
            "nota": task.numeric_value,
            "frequencia": "C" if task.status_value == CanonicalStatus.PRESENT else "F"
        }


class MachadoAdapter(BasePortalAdapter):
    portal_id = "machado_sobrinho"

    def to_canonical(self, raw: Dict[str, Any]) -> CanonicalTask:
        raw_acao = (raw.get("acao") or "").lower()
        action = CanonicalAction.POST_GRADE if "nota" in raw_acao else CanonicalAction.RECORD_ATTENDANCE
        return CanonicalTask(
            action=action,
            student_name=raw.get("aluno"),
            class_id=raw.get("turma"),
            discipline=raw.get("disciplina"),
            numeric_value=float(raw["nota"]) if "nota" in raw and raw["nota"] is not None else None,
            portal_id=self.portal_id,
            raw_payload=raw
        )

    def from_canonical(self, task: CanonicalTask) -> Dict[str, Any]:
        return {
            "portal": "machado_sobrinho",
            "acao": "lancar_nota" if task.action == CanonicalAction.POST_GRADE else "lancar_falta",
            "aluno": task.student_name,
            "turma": task.class_id,
            "nota": task.numeric_value,
            "faltas": 1 if task.status_value == CanonicalStatus.ABSENT else 0
        }


ADAPTERS: Dict[str, BasePortalAdapter] = {
    "ieducar": IeducarAdapter(),
    "sed_sp": SedSpAdapter(),
    "machado_sobrinho": MachadoAdapter(),
    "machado": MachadoAdapter(),
}


def get_portal_adapter(portal_id: str) -> BasePortalAdapter:
    """Retorna o adaptador correspondente ao portal informado."""
    clean_id = (portal_id or "").lower().strip()
    return ADAPTERS.get(clean_id, MachadoAdapter())
