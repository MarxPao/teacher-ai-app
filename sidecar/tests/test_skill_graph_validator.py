"""
test_skill_graph_validator.py — Suíte de Testes do Skill Graph Engine (Lote 1 & 1.1)

Verifica a validação estática de segurança, a rejeição categórica de grafos
sem CHECKPOINT, bypass em topologias diamante/loop, grafos somente leitura,
classificação explícita de is_submit_action e integridade do Skill Store.
"""

import pytest
import shutil
import tempfile
from pathlib import Path

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams
from graph_validator import validate_skill_graph, assert_graph_safe, UnsafeGraphError
from skill_store import save_skill, load_skill, list_skills, SkillNotFoundError

# ── FIXTURES DE GRAFOS ORIGINAIS (LOTE 1) ─────────────────────────────────────

def create_unsafe_direct_write_graph() -> dict:
    """Grafo inseguro: Tenta escrever sem nenhum nó CHECKPOINT."""
    return {
        "id": "skill_unsafe_direct",
        "name": "Lançamento Furtivo sem Confirmação",
        "portal_id": "machado_sobrinho",
        "task_id": "lancar_falta_furtiva",
        "version": 1,
        "entry_node": "nav_diario",
        "nodes": {
            "nav_diario": {
                "id": "nav_diario",
                "type": "NAVIGATE",
                "params": {},
                "on_success": "write_falta"
            },
            "write_falta": {
                "id": "write_falta",
                "type": "WRITE",
                "anchor": {"strategy": "css_selector", "value": "#input-falta"},
                "params": {"action_value": "F"},
                "on_success": "click_salvar"
            },
            "click_salvar": {
                "id": "click_salvar",
                "type": "CLICK",
                "anchor": {"strategy": "text_match", "value": "Salvar"},
                "params": {"is_submit_action": True},
                "on_success": None
            }
        }
    }

def create_bypass_branch_graph() -> dict:
    """Grafo inseguro: Possui bifurcação onde um ramo desvia do CHECKPOINT."""
    return {
        "id": "skill_bypass_branch",
        "name": "Bypass de Checkpoint via Branch",
        "portal_id": "machado_sobrinho",
        "task_id": "lancar_nota_bypass",
        "version": 1,
        "entry_node": "check_admin",
        "nodes": {
            "check_admin": {
                "id": "check_admin",
                "type": "BRANCH",
                "params": {"condition": "is_admin"},
                "on_success": "write_nota_direto",  # BYPASS INSEGURO!
                "on_fail": "ask_approval"
            },
            "ask_approval": {
                "id": "ask_approval",
                "type": "CHECKPOINT",
                "params": {"description": "Lançar nota para {aluno}"},
                "on_success": "write_nota_direto"
            },
            "write_nota_direto": {
                "id": "write_nota_direto",
                "type": "WRITE",
                "anchor": {"strategy": "aria_label", "value": "Nota Bimestre"},
                "params": {"action_value": "{nota}"},
                "on_success": None
            }
        }
    }

def create_broken_references_graph() -> dict:
    """Grafo com integridade corrompida: aponta para nó que não existe."""
    return {
        "id": "skill_broken_refs",
        "name": "Grafo com Nós Faltantes",
        "portal_id": "machado_sobrinho",
        "task_id": "broken_task",
        "version": 1,
        "entry_node": "start_step",
        "nodes": {
            "start_step": {
                "id": "start_step",
                "type": "NAVIGATE",
                "params": {},
                "on_success": "inexistent_phantom_step"
            }
        }
    }

def create_safe_write_graph() -> dict:
    """Grafo seguro e conforme: Todo caminho para WRITE passa por CHECKPOINT."""
    return {
        "id": "skill_safe_write",
        "name": "Lançar Falta com Confirmação Humana",
        "portal_id": "machado_sobrinho",
        "task_id": "lancar_falta",
        "version": 1,
        "entry_node": "nav_diario",
        "nodes": {
            "nav_diario": {
                "id": "nav_diario",
                "type": "NAVIGATE",
                "params": {},
                "on_success": "locate_aluno"
            },
            "locate_aluno": {
                "id": "locate_aluno",
                "type": "LOCATE",
                "anchor": {"strategy": "text_match", "value": "{aluno}"},
                "params": {},
                "on_success": "cp_confirmar_falta"
            },
            "cp_confirmar_falta": {
                "id": "cp_confirmar_falta",
                "type": "CHECKPOINT",
                "params": {
                    "description": "Confirmar falta para {aluno} no dia {data}"
                },
                "on_success": "write_falta_aluno"
            },
            "write_falta_aluno": {
                "id": "write_falta_aluno",
                "type": "WRITE",
                "anchor": {"strategy": "css_selector", "value": "input[name='presenca']"},
                "params": {"action_value": "F"},
                "on_success": "click_salvar_chamada"
            },
            "click_salvar_chamada": {
                "id": "click_salvar_chamada",
                "type": "CLICK",
                "anchor": {"strategy": "aria_label", "value": "Salvar Diário"},
                "params": {"is_submit_action": True},
                "on_success": None
            }
        }
    }

# ── FIXTURES DE GRAFOS (LOTE 1.1: CASOS DE BORDA E TOPOLOGIA) ─────────────────

def create_read_only_roster_graph() -> dict:
    """Grafo puramente de leitura: sem nós de risco, sem exigir CHECKPOINT."""
    return {
        "id": "skill_read_only_roster",
        "name": "Leitura de Lista de Alunos",
        "portal_id": "machado_sobrinho",
        "task_id": "read_roster",
        "version": 1,
        "entry_node": "nav_turma",
        "nodes": {
            "nav_turma": {
                "id": "nav_turma",
                "type": "NAVIGATE",
                "params": {},
                "on_success": "click_tab_alunos"
            },
            "click_tab_alunos": {
                "id": "click_tab_alunos",
                "type": "CLICK",
                "anchor": {"strategy": "text_match", "value": "Alunos"},
                "params": {"is_submit_action": False},  # Clique de navegação seguro
                "on_success": "locate_tabela"
            },
            "locate_tabela": {
                "id": "locate_tabela",
                "type": "LOCATE",
                "anchor": {"strategy": "css_selector", "value": "table#alunos"},
                "params": {},
                "on_success": "read_linha"
            },
            "read_linha": {
                "id": "read_linha",
                "type": "READ",
                "anchor": {"strategy": "css_selector", "value": "tr.aluno-row"},
                "params": {},
                "on_success": "loop_paginacao"
            },
            "loop_paginacao": {
                "id": "loop_paginacao",
                "type": "LOOP",
                "params": {"loop_target": "nav_turma"},
                "on_success": None
            }
        }
    }

def create_unclassified_click_graph() -> dict:
    """Nó CLICK sem declaração explícita de is_submit_action."""
    return {
        "id": "skill_unclassified_click",
        "name": "Click sem Classificação Explícita",
        "portal_id": "machado_sobrinho",
        "task_id": "unclassified_task",
        "version": 1,
        "entry_node": "click_desconhecido",
        "nodes": {
            "click_desconhecido": {
                "id": "click_desconhecido",
                "type": "CLICK",
                "anchor": {"strategy": "text_match", "value": "Botão X"},
                "params": {},  # is_submit_action ausente propositalmente!
                "on_success": None
            }
        }
    }

def create_safe_diamond_loop_graph() -> dict:
    """Topologia diamante / LOOP com BRANCH interno SEGURO (Ramo B passa por CHECKPOINT)."""
    return {
        "id": "skill_safe_diamond_loop",
        "name": "Lançar Falta com Loop e Branch Seguro",
        "portal_id": "machado_sobrinho",
        "task_id": "loop_falta_seguro",
        "version": 1,
        "entry_node": "loop_alunos",
        "nodes": {
            "loop_alunos": {
                "id": "loop_alunos",
                "type": "LOOP",
                "params": {},
                "on_success": "branch_tem_falta",
                "on_fail": None
            },
            "branch_tem_falta": {
                "id": "branch_tem_falta",
                "type": "BRANCH",
                "params": {"condition": "ja_tem_falta"},
                "on_success": "loop_alunos",  # Ramo A: pula
                "on_fail": "cp_confirmar_falta_loop"  # Ramo B: exige CHECKPOINT
            },
            "cp_confirmar_falta_loop": {
                "id": "cp_confirmar_falta_loop",
                "type": "CHECKPOINT",
                "params": {"description": "Lançar falta para {aluno}"},
                "on_success": "write_falta_loop"
            },
            "write_falta_loop": {
                "id": "write_falta_loop",
                "type": "WRITE",
                "anchor": {"strategy": "css_selector", "value": "input.falta"},
                "params": {"action_value": "F"},
                "on_success": "click_submit_loop"
            },
            "click_submit_loop": {
                "id": "click_submit_loop",
                "type": "CLICK",
                "anchor": {"strategy": "text_match", "value": "Gravar"},
                "params": {"is_submit_action": True},
                "on_success": "loop_alunos"
            }
        }
    }

def create_unsafe_diamond_loop_graph() -> dict:
    """Topologia diamante / LOOP com BRANCH interno INSEGURO (Ramo B pula CHECKPOINT)."""
    return {
        "id": "skill_unsafe_diamond_loop",
        "name": "Bypass de Checkpoint dentro de Loop Diamante",
        "portal_id": "machado_sobrinho",
        "task_id": "loop_falta_inseguro",
        "version": 1,
        "entry_node": "loop_alunos",
        "nodes": {
            "loop_alunos": {
                "id": "loop_alunos",
                "type": "LOOP",
                "params": {},
                "on_success": "branch_tem_falta",
                "on_fail": None
            },
            "branch_tem_falta": {
                "id": "branch_tem_falta",
                "type": "BRANCH",
                "params": {"condition": "ja_tem_falta"},
                "on_success": "loop_alunos",  # Ramo A: pula
                "on_fail": "write_falta_direto"  # Ramo B: PULA O CHECKPOINT DIRETO!
            },
            "cp_confirmar_falta_loop": {
                "id": "cp_confirmar_falta_loop",
                "type": "CHECKPOINT",
                "params": {"description": "Lançar falta para {aluno}"},
                "on_success": "write_falta_direto"
            },
            "write_falta_direto": {
                "id": "write_falta_direto",
                "type": "WRITE",
                "anchor": {"strategy": "css_selector", "value": "input.falta"},
                "params": {"action_value": "F"},
                "on_success": "click_submit_loop"
            },
            "click_submit_loop": {
                "id": "click_submit_loop",
                "type": "CLICK",
                "anchor": {"strategy": "text_match", "value": "Gravar"},
                "params": {"is_submit_action": True},
                "on_success": "loop_alunos"
            }
        }
    }

# ── TESTES UNITÁRIOS DO VALIDADOR (ORIGINAIS LOTE 1) ──────────────────────────

def test_reject_direct_write_without_checkpoint():
    """Validador deve rejeitar grafo que tenta WRITE/submit sem CHECKPOINT."""
    graph = create_unsafe_direct_write_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is False
    assert any("VIOLAÇÃO DE SEGURANÇA: Grafo possui ações de risco" in err for err in errors)
    assert any("nenhum nó 'CHECKPOINT' foi declarado" in err for err in errors)

def test_reject_bypass_branch_around_checkpoint():
    """Validador deve rejeitar grafo onde uma bifurcação contorna o CHECKPOINT."""
    graph = create_bypass_branch_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is False
    assert any("pode ser alcançado sem passar por CHECKPOINT prévio" in err for err in errors)
    assert any("check_admin -> write_nota_direto" in err for err in errors)

def test_reject_broken_node_references():
    """Validador deve rejeitar grafo com ponteiros para nós inexistentes."""
    graph = create_broken_references_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is False
    assert any("on_success aponta para nó inexistente 'inexistent_phantom_step'" in err for err in errors)

def test_approve_safe_graph():
    """Validador deve aprovar grafo seguro que possui nó CHECKPOINT protegendo a escrita."""
    graph = create_safe_write_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is True
    assert len(errors) == 0

def test_assert_graph_safe_raises_exception():
    """assert_graph_safe deve disparar UnsafeGraphError para grafos inseguros."""
    unsafe_graph = create_unsafe_direct_write_graph()
    with pytest.raises(UnsafeGraphError) as exc_info:
        assert_graph_safe(unsafe_graph)
    
    assert "Grafo rejeitado por violar regras de segurança" in str(exc_info.value)

# ── NOVOS TESTES UNITÁRIOS (LOTE 1.1: LACUNAS DE VERIFICAÇÃO) ─────────────────

def test_approve_read_only_graph_without_checkpoint():
    """Validador deve APROVAR grafo somente leitura (sem WRITE/CLICK submit) mesmo sem nó CHECKPOINT."""
    graph = create_read_only_roster_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is True
    assert len(errors) == 0

def test_reject_click_node_without_explicit_is_submit_action():
    """Validador deve REJEITAR nó CLICK sem declaração explícita de is_submit_action (postura fail-safe)."""
    graph = create_unclassified_click_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is False
    assert any("deve declarar explicitamente o campo 'is_submit_action'" in err for err in errors)

def test_approve_diamond_loop_with_checkpoint_in_branch():
    """Validador deve APROVAR grafo com topologia diamante/LOOP quando o ramo de escrita passa por CHECKPOINT."""
    graph = create_safe_diamond_loop_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is True
    assert len(errors) == 0

def test_reject_diamond_loop_bypassing_checkpoint_in_branch():
    """Validador deve REJEITAR grafo com topologia diamante/LOOP quando o ramo de escrita contorna o CHECKPOINT."""
    graph = create_unsafe_diamond_loop_graph()
    is_valid, errors = validate_skill_graph(graph)
    
    assert is_valid is False
    assert any("pode ser alcançado sem passar por CHECKPOINT prévio" in err for err in errors)
    assert any("loop_alunos -> branch_tem_falta -> write_falta_direto" in err for err in errors)

# ── TESTES UNITÁRIOS DO SKILL STORE ───────────────────────────────────────────

def test_skill_store_refuses_to_save_unsafe_graph():
    """SkillStore JAMAIS deve persistir em disco um grafo inseguro."""
    with tempfile.TemporaryDirectory() as temp_dir:
        unsafe_graph = create_unsafe_direct_write_graph()
        
        with pytest.raises(UnsafeGraphError):
            save_skill(unsafe_graph, base_dir=temp_dir)
            
        # Garante que nenhum arquivo foi gravado no diretório
        files = list(Path(temp_dir).glob("**/*.json"))
        assert len(files) == 0

def test_skill_store_saves_and_loads_safe_graph():
    """SkillStore deve salvar e carregar com sucesso um grafo seguro."""
    with tempfile.TemporaryDirectory() as temp_dir:
        safe_graph = create_safe_write_graph()
        
        saved_path = save_skill(safe_graph, base_dir=temp_dir)
        assert saved_path.exists()
        assert saved_path.name == "v1.json"
        assert "machado_sobrinho__lancar_falta" in str(saved_path)
        
        # Carrega a skill salva
        loaded = load_skill("machado_sobrinho", "lancar_falta", version=1, base_dir=temp_dir)
        assert loaded.id == "skill_safe_write"
        assert loaded.entry_node == "nav_diario"
        assert "cp_confirmar_falta" in loaded.nodes
        assert loaded.nodes["cp_confirmar_falta"].type == "CHECKPOINT"

def test_skill_store_lists_and_loads_latest_version():
    """SkillStore deve listar versões disponíveis e carregar a mais recente quando version=None."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Cria v1
        g1 = create_safe_write_graph()
        g1["version"] = 1
        save_skill(g1, base_dir=temp_dir)
        
        # Cria v2
        g2 = create_safe_write_graph()
        g2["version"] = 2
        g2["name"] = "Versão 2 Aprimorada"
        save_skill(g2, base_dir=temp_dir)
        
        # Lista skills
        skills_list = list_skills(base_dir=temp_dir)
        assert len(skills_list) == 1
        assert skills_list[0]["portal_id"] == "machado_sobrinho"
        assert skills_list[0]["task_id"] == "lancar_falta"
        assert skills_list[0]["versions"] == [1, 2]
        assert skills_list[0]["latest_version"] == 2
        
        # Carrega sem especificar versão -> deve carregar a v2
        latest = load_skill("machado_sobrinho", "lancar_falta", version=None, base_dir=temp_dir)
        assert latest.version == 2
        assert latest.name == "Versão 2 Aprimorada"
