"""
skill_graph_schema.py — Modelos Pydantic v2 do Skill Graph (Lote 1)
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timezone

SkillNodeType = Literal[
    "NAVIGATE",
    "LOCATE",
    "READ",
    "BRANCH",
    "LOOP",
    "WRITE",
    "CLICK",
    "CHECKPOINT",
    "WAIT"
]

AnchorStrategy = Literal[
    "aria_label",
    "text_match",
    "css_selector",
    "semantic_role",
    "vision_fallback"
]

class SkillAnchor(BaseModel):
    strategy: AnchorStrategy
    value: str
    scope: Optional[str] = None
    description: Optional[str] = None

class SkillNodeParams(BaseModel):
    model_config = ConfigDict(extra="allow")
    variable_bindings: List[str] = Field(default_factory=list)
    action_value: Optional[str] = None
    condition: Optional[str] = None
    # Classificação de impacto (v0.1: manual e explícita). Obrigatória para nós CLICK.
    is_submit_action: Optional[bool] = None
    description: Optional[str] = None

class RetryPolicy(BaseModel):
    max_attempts: int = 2
    backoff_ms: int = 500

class SkillNode(BaseModel):
    id: str
    type: SkillNodeType
    anchor: Optional[SkillAnchor] = None
    params: SkillNodeParams = Field(default_factory=SkillNodeParams)
    on_success: Optional[str] = None
    on_fail: Optional[str] = None
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)

class SkillGraphMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")
    success_rate: float = 100.0
    total_executions: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_verified_at: Optional[str] = None
    has_self_healed: bool = False
    author: str = "teacher_ai_recorder"

class SkillGraph(BaseModel):
    id: str
    name: str
    portal_id: str
    task_id: str
    version: int = 1
    entry_node: str
    nodes: Dict[str, SkillNode]
    metadata: SkillGraphMetadata = Field(default_factory=SkillGraphMetadata)
