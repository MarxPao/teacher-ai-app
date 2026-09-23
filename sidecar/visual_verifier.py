"""
visual_verifier.py — Verificador Visual e Anti-Reversão por Frameworks SPA (Teacher AI)

Valida que uma operação de escrita executada pelo SafeWriter permaneceu gravada
no DOM e na tela da professora após eventos de 'blur', prevenindo reversões silenciosas
causadas por gerenciadores de estado reativos (React, Vue, Angular).
"""

from typing import Any, Dict, Optional, Tuple


def normalize_value_str(val: Any) -> str:
    """Normaliza valores para comparação determinística (trata vírgula/ponto e espaços)."""
    if val is None:
        return ""
    s = str(val).strip().replace(",", ".")
    # Normaliza inteiros representados como floats (ex: 9.0 -> 9)
    try:
        f = float(s)
        if f.is_integer():
            return str(int(f))
        return str(f)
    except ValueError:
        return s.lower()


def verify_dom_persistence(expected_value: Any, read_back_value: Any) -> bool:
    """
    Verifica se o valor lido do campo após o evento blur é equivalente ao valor esperado.
    Retorna True se persistiu com sucesso, False se o framework SPA reverteu o valor.
    """
    exp_norm = normalize_value_str(expected_value)
    act_norm = normalize_value_str(read_back_value)
    return exp_norm == act_norm


def calculate_image_diff_ratio(
    img_before_bytes: Optional[bytes],
    img_after_bytes: Optional[bytes]
) -> Tuple[bool, float]:
    """
    Calcula se houve alteração visual perceptível entre dois snapshots.
    Retorna (has_visual_change, diff_ratio).
    Opera com bytes brutos de forma resiliente mesmo se Pillow não estiver disponível.
    """
    if not img_before_bytes or not img_after_bytes:
        return True, 1.0

    if img_before_bytes == img_after_bytes:
        # Imagens idênticas byte a byte: nenhuma alteração na tela
        return False, 0.0

    try:
        from PIL import Image
        import io

        img_a = Image.open(io.BytesIO(img_before_bytes)).convert("L")
        img_b = Image.open(io.BytesIO(img_after_bytes)).convert("L")

        if img_a.size != img_b.size:
            return True, 1.0

        # Contagem simples de pixels divergentes
        pixels_a = list(img_a.getdata())
        pixels_b = list(img_b.getdata())
        total = len(pixels_a)
        diffs = sum(1 for pa, pb in zip(pixels_a, pixels_b) if abs(pa - pb) > 10)
        ratio = diffs / total if total > 0 else 0.0
        return ratio > 0.005, ratio
    except Exception:
        # Fallback para comparação de tamanho de bytes caso PIL falhe
        diff_ratio = abs(len(img_before_bytes) - len(img_after_bytes)) / max(len(img_before_bytes), 1)
        return True, diff_ratio


def verify_write_execution(
    expected_value: Any,
    read_back_value: Any,
    img_before: Optional[bytes] = None,
    img_after: Optional[bytes] = None
) -> Dict[str, Any]:
    """
    Executa a verificação combinada (DOM State + Visual Pixels).
    """
    dom_persisted = verify_dom_persistence(expected_value, read_back_value)
    visual_changed, diff_ratio = calculate_image_diff_ratio(img_before, img_after)

    is_verified = dom_persisted and (visual_changed or img_before is None)

    return {
        "verified": is_verified,
        "dom_persisted": dom_persisted,
        "visual_changed": visual_changed,
        "pixel_diff_ratio": round(diff_ratio, 4),
        "expected": expected_value,
        "actual": read_back_value,
        "status": "success" if is_verified else "reverted_by_spa"
    }
