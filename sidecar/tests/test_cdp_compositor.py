"""
Testes Unitários do CDP Native Compositor (Execução no Nível do Sistema Operacional)
"""

import pytest
from sidecar.cdp_compositor import CDPCompositor, cdp_compositor


def test_calculate_centroid():
    # Retângulo de 100x50: (100,200) até (300,250)
    box = [100.0, 200.0, 300.0, 200.0, 300.0, 250.0, 100.0, 250.0]
    cx, cy = CDPCompositor.calculate_centroid(box)
    assert cx == 200.0
    assert cy == 225.0


def test_calculate_centroid_invalid_raises():
    with pytest.raises(ValueError):
        CDPCompositor.calculate_centroid([10.0, 20.0])


def test_generate_mouse_click_sequence():
    seq = CDPCompositor.generate_mouse_click_sequence(250.5, 310.2, button="left")
    assert len(seq) == 3
    
    # 1. mouseMoved
    assert seq[0]["method"] == "Input.dispatchMouseEvent"
    assert seq[0]["params"]["type"] == "mouseMoved"
    assert seq[0]["params"]["x"] == 250.5
    assert seq[0]["params"]["y"] == 310.2
    
    # 2. mousePressed
    assert seq[1]["params"]["type"] == "mousePressed"
    assert seq[1]["params"]["button"] == "left"
    assert seq[1]["params"]["buttons"] == 1
    
    # 3. mouseReleased
    assert seq[2]["params"]["type"] == "mouseReleased"
    assert seq[2]["params"]["buttons"] == 0


def test_generate_type_sequence():
    seq = CDPCompositor.generate_type_sequence("Nota 10", clear_before=True)
    
    # Deve conter Ctrl+A (2 eventos) + Backspace (2 eventos) + 7 chars * 2 eventos = 18 eventos
    assert len(seq) == 4 + (7 * 2)
    
    # Checa Ctrl+A
    assert seq[0]["params"]["type"] == "rawKeyDown"
    assert seq[0]["params"]["modifiers"] == 2
    assert seq[0]["params"]["windowsVirtualKeyCode"] == 65
    
    # Checa Backspace
    assert seq[2]["params"]["windowsVirtualKeyCode"] == 8
    
    # Checa digitação do primeiro char ('N')
    assert seq[4]["params"]["type"] == "keyDown"
    assert seq[4]["params"]["text"] == "N"


@pytest.mark.asyncio
async def test_execute_native_actions_async():
    sent_commands = []

    async def mock_cdp_send(method, params):
        sent_commands.append((method, params))

    res_click = await cdp_compositor.execute_native_click(mock_cdp_send, 150.0, 250.0)
    assert res_click["success"] is True
    assert len(sent_commands) == 3

    sent_commands.clear()
    res_type = await cdp_compositor.execute_native_typing(mock_cdp_send, "Oi", clear_before=False)
    assert res_type["success"] is True
    assert len(sent_commands) == 4  # 2 caracteres * 2 eventos
