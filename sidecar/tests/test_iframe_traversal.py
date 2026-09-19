"""
sidecar/tests/test_iframe_traversal.py — Testes Unitários da Travessia Recursiva de Iframes
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.iframe_traversal_skill import CDPIframeTraverser, FrameNode


def test_parse_frame_tree_nested_hierarchy():
    raw_cdp_tree = {
        "frame": {
            "id": "root_frame",
            "url": "https://portal.escola.com.br/main",
            "name": "root"
        },
        "childFrames": [
            {
                "frame": {
                    "id": "frame_menu",
                    "url": "https://portal.escola.com.br/menu",
                    "parentId": "root_frame",
                    "name": "menu_nav"
                },
                "childFrames": []
            },
            {
                "frame": {
                    "id": "frame_content",
                    "url": "https://portal.escola.com.br/content",
                    "parentId": "root_frame",
                    "name": "content_area"
                },
                "childFrames": [
                    {
                        "frame": {
                            "id": "frame_grid",
                            "url": "https://portal.escola.com.br/notas_grid",
                            "parentId": "frame_content",
                            "name": "grid_notas"
                        },
                        "childFrames": []
                    }
                ]
            }
        ]
    }

    root = CDPIframeTraverser.parse_frame_tree(raw_cdp_tree)
    assert root.frame_id == "root_frame"
    assert len(root.child_frames) == 2

    # Flattened list deve conter 4 frames no total
    all_frames = CDPIframeTraverser.flatten_frame_tree(root)
    assert len(all_frames) == 4
    frame_ids = [f.frame_id for f in all_frames]
    assert "frame_grid" in frame_ids
    assert "frame_menu" in frame_ids


def test_translate_iframe_coordinates():
    # Suponha que o iframe está em x=100, y=200 com borda de 2px
    iframe_bbox = {
        "x": 100.0,
        "y": 200.0,
        "border_left": 2.0,
        "border_top": 2.0
    }
    # O botão dentro do iframe está em x=50, y=30
    abs_x, abs_y = CDPIframeTraverser.translate_iframe_coordinates(50.0, 30.0, iframe_bbox)

    assert abs_x == 152.0
    assert abs_y == 232.0


def test_generate_multi_frame_query_script():
    script = CDPIframeTraverser.generate_multi_frame_query_script("input#txtNota")
    assert "input#txtNota" in script
    assert "contentDocument" in script
    assert "in_iframe" in script
