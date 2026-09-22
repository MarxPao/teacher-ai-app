"""
visual_grounding.py — Localização Visual de Elementos por Coordenadas (OCR Fallback)

Permite que o motor Teacher AI localize botões, campos de texto e nomes de alunos
em páginas heterodoxas renderizadas em HTML5 <canvas> ou SVGs interativos onde
não existem elementos <input> ou <table> acessíveis no DOM tradicional.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import unicodedata


@dataclass
class BoundingBox:
    x: int
    y: int
    width: int
    height: int
    text: str
    confidence: float

    @property
    def center_point(self) -> Tuple[int, int]:
        """Retorna o ponto central (x, y) ideal para disparo de clique via CDP."""
        return (self.x + self.width // 2, self.y + self.height // 2)


def _clean_str(s: str) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFD", s)
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn").lower().strip()


class VisualGroundingEngine:
    """Motor de localização visual local com suporte a OCR e fallback resiliente."""

    def __init__(self):
        self._ocr_available = False
        try:
            import pytesseract
            self._ocr_available = True
        except ImportError:
            pass

    def find_target_coordinates(
        self,
        image_bytes: bytes,
        target_text: str,
        mock_candidates: Optional[List[BoundingBox]] = None
    ) -> Optional[BoundingBox]:
        """
        Localiza a caixa delimitadora do texto alvo na imagem.
        Retorna BoundingBox ou None se não encontrado.
        """
        if not target_text:
            return None

        clean_target = _clean_str(target_text)

        # 1. Se fornecido mock/candidatos estruturados (testes unitários ou metadados de layout)
        if mock_candidates:
            for box in mock_candidates:
                if clean_target in _clean_str(box.text):
                    return box

        # 2. OCR real se pytesseract estiver instalado
        if self._ocr_available and image_bytes:
            try:
                import pytesseract
                from PIL import Image
                import io

                img = Image.open(io.BytesIO(image_bytes))
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

                n_boxes = len(data["text"])
                for i in range(n_boxes):
                    text = data["text"][i].strip()
                    if clean_target in _clean_str(text):
                        return BoundingBox(
                            x=data["left"][i],
                            y=data["top"][i],
                            width=data["width"][i],
                            height=data["height"][i],
                            text=text,
                            confidence=float(data["conf"][i]) / 100.0
                        )
            except Exception:
                pass

        return None

    def calculate_relative_click_point(
        self,
        box: BoundingBox,
        viewport_width: int = 1280,
        viewport_height: int = 800
    ) -> Dict[str, Any]:
        """Converte coordenadas absolutas para fração relativa do viewport."""
        cx, cy = box.center_point
        return {
            "x": cx,
            "y": cy,
            "relative_x": round(cx / max(viewport_width, 1), 4),
            "relative_y": round(cy / max(viewport_height, 1), 4),
            "text": box.text,
            "confidence": box.confidence
        }

    def find_spatially_aligned_input(
        self,
        label_box: BoundingBox,
        candidate_inputs: List[BoundingBox],
        max_distance_x: int = 500,
        max_tolerance_y: int = 20
    ) -> Optional[BoundingBox]:
        """
        Localiza o campo de input espacialmente alinhado à direita de um rótulo de texto (ex: nome do aluno).
        Garante imunidade a classes CSS dinâmicas ou ausência de IDs.
        Critérios:
        - O input deve estar à direita do rótulo (input.x >= label.x).
        - A distância horizontal deve ser razoável (<= max_distance_x).
        - A sobreposição vertical (Y-overlap) deve ser forte ou o centro Y alinhado (|cy_input - cy_label| <= max_tolerance_y).
        """
        if not label_box or not candidate_inputs:
            return None

        label_cx, label_cy = label_box.center_point
        label_right = label_box.x + label_box.width

        best_match = None
        min_dist = float("inf")

        for inp in candidate_inputs:
            inp_cx, inp_cy = inp.center_point

            # Deve estar à direita do início do rótulo
            if inp.x < label_box.x:
                continue

            dist_x = inp.x - label_right
            if dist_x < -10 or dist_x > max_distance_x:
                continue

            # Alinhamento vertical
            diff_y = abs(inp_cy - label_cy)
            if diff_y <= max_tolerance_y:
                # Preferência para o input mais próximo à direita
                if dist_x < min_dist:
                    min_dist = dist_x
                    best_match = inp

        return best_match

