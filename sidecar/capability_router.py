"""
capability_router.py — Roteador de Capacidade Agêntica (Python Sidecar)
Classifica a complexidade da ação e garante que ações de alta exigência só executem
se o modelo BYOK configurado pelo professor possuir suporte confiável a visão computacional.
"""

from typing import Tuple

# Portais com seletores e formulários pré-mapeados e estáveis
KNOWN_MAPPED_PORTALS = {"machado", "santacatarina", "plural", "cambridge", "teams", "canva"}

# Provedores e modelos com suporte comprovado a Visão Computacional e Coordenadas
VISION_CAPABLE_PROVIDERS = {"openai", "anthropic", "gemini"}

KNOWN_VISION_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-5-sonnet",
    "claude-3-opus",
    "claude-3-sonnet",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "qwen-vl"
]

def classify_action(action_type: str, portal: str, has_known_selector_map: bool = True) -> str:
    """
    Retorna 'low_complexity' ou 'high_complexity'.
    'low_complexity': seletor já mapeado, ação é preenchimento direto sem necessidade de inferência visual.
    'high_complexity': portal sem mapa conhecido, presença de iframe/Shadow DOM, ou ação exige leitura de tabela não estruturada.
    """
    if has_known_selector_map:
        return "low_complexity"

    portal_clean = (portal or "").lower().strip()
    if portal_clean in KNOWN_MAPPED_PORTALS:
        return "low_complexity"

    return "high_complexity"

def model_supports_vision(model_provider: str, model_name: str) -> bool:
    """
    Consulta lista de modelos com suporte confiável a visão/coordenadas
    (ex: Claude 3.5+, GPT-4o, Gemini 1.5+ Pro/Flash). Modelos text-only
    (ex: Groq Llama-3, DeepSeek text-only) retornam False.
    """
    prov = (model_provider or "").lower().strip()
    mod = (model_name or "").lower().strip()

    if prov in VISION_CAPABLE_PROVIDERS:
        return True

    for v_model in KNOWN_VISION_MODELS:
        if v_model in mod:
            return True

    return False

def can_execute_autonomously(
    action_type: str,
    portal: str,
    model_provider: str,
    model_name: str,
    has_known_selector_map: bool = True
) -> Tuple[bool, str, str]:
    """
    Avalia se o Sidecar pode executar a ação de forma autônoma.
    Retorna: (pode_executar, complexidade, motivo_se_bloqueado)
    """
    complexity = classify_action(action_type, portal, has_known_selector_map)

    # Complexidade baixa (seletores mapeados): Qualquer modelo BYOK pode orquestrar
    if complexity == "low_complexity":
        return (True, "low_complexity", "Ação com seletores mapeados suportada.")

    # Complexidade alta: Exige modelo com visão computacional comprovada
    if model_supports_vision(model_provider, model_name):
        return (True, "high_complexity", "Modelo BYOK compatível com visão computacional.")

    motivo = (
        f"Ação requer inferência visual em '{portal}', mas o modelo configurado "
        f"('{model_provider} / {model_name}') é otimizado para texto. "
        "Operação direcionada para o modo manual supervisionado."
    )
    return (False, "high_complexity", motivo)
