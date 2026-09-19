"""
response_translator.py — Tradutor de Respostas Técnicas para Linguagem Humana (Teacher AI)

Converte retornos técnicos do manual_runner/SafeWriter em frases curtas,
acolhedoras e naturais em português brasileiro para a professora.

DIRETRIZ INEGOCIÁVEL: ZERO TERMOS TÉCNICOS.
Nunca expor: "CDP", "drift_detectado", "portal_id", portas (9222, 8765),
códigos HTTP, seletores DOM ou stacktraces.
"""

import re
import time
from typing import Any, Dict, List, Optional


TECHNICAL_TERMS_BLACKLIST = [
    r"\bcdp\b",
    r"\bdom\b",
    r"\bdrift\b",
    r"\bdrift_detectado\b",
    r"\b9222\b",
    r"\b8765\b",
    r"\bhttp://\b",
    r"\bhttps://\b",
    r"\bstatus code\b",
    r"\berr_\w+\b",
    r"\blen\(\w+\)\b",
    r"\blocalhost\b",
    r"\btimeout\b",
    r"\bexception\b",
    r"\btraceback\b",
    r"\bselector\b",
    r"\blocator\b"
]


def sanitize_message(msg: str) -> str:
    """Remove qualquer resquício de jargão técnico da mensagem."""
    if not msg:
        return ""
    cleaned = msg
    for pattern in TECHNICAL_TERMS_BLACKLIST:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def translate_task_response(task_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Traduz o retorno de execute_task_intent ou /task em uma resposta humana
    e dados para o card de aprovação quando aplicável.
    """
    if not isinstance(task_result, dict):
        return {
            "human_message": "Não consegui processar a operação no portal no momento. Pode tentar novamente?",
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": None,
            "status": "unknown_error",
            "sucesso": False
        }

    sucesso = bool(task_result.get("sucesso", False))
    status = str(task_result.get("status", "")).strip()
    acao = task_result.get("acao", "")
    diff = task_result.get("diff") or {}
    aluno = diff.get("aluno") or task_result.get("aluno") or "o aluno"
    campo = diff.get("campo") or ("nota" if acao == "lancar_nota" else "falta")
    novo_valor = diff.get("depois", "")
    valor_anterior = diff.get("antes", "")
    screenshot_path = task_result.get("screenshot")

    # 1. Sucesso com formulário preenchido -> aciona card de aprovação
    if status == "draft_completed_pending_submit":
        card_id = f"task_{int(time.time() * 1000)}"
        diff_item = {
            "studentName": str(aluno),
            "field": str(campo).capitalize(),
            "beforeValue": str(valor_anterior) if valor_anterior != "" else "—",
            "afterValue": str(novo_valor)
        }

        approval_card = {
            "taskId": card_id,
            "portal": task_result.get("portal") or "Portal Escolar",
            "actionType": acao or "lancar_nota",
            "summary": f"Lançamento de {campo} para {aluno}",
            "diff": [diff_item],
            "screenshotUrl": screenshot_path
        }

        msg = (
            f"Prontinho, professora! Preenchi a {campo} {novo_valor} para {aluno}. "
            "Dá uma conferida no cartão abaixo com a foto da tela para aprovar o salvamento definitivo no portal."
        )

        return {
            "human_message": msg,
            "needs_approval": True,
            "approval_card_data": approval_card,
            "action_required": "confirm_approval",
            "status": status,
            "sucesso": True
        }

    # 2. Ação Humana Necessária (Login, Captcha, Bloqueio)
    if status == "human_action_required":
        estado = str(task_result.get("estado", "")).lower()
        if "login" in estado:
            msg = "Professora, preciso que você faça login no portal na janela do navegador para eu continuar."
            action = "login_required"
        elif "captcha" in estado or "cloudflare" in estado:
            msg = "Professora, apareceu uma verificação de segurança (captcha) no portal. Por favor, resolva na janela do navegador para continuarmos."
            action = "captcha_required"
        else:
            msg = "Professora, preciso que você conclua uma confirmação rápida na janela do navegador para eu prosseguir."
            action = "human_interaction"

        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": action,
            "status": status,
            "sucesso": False
        }

    # 2.5 Bloqueio por proveniência não autorizada (Origin Verification Gate)
    if status == "blocked_untrusted_origin":
        msg = (
            "Aviso de Segurança: Uma solicitação de alteração no portal foi recusada porque sua "
            "origem partiu de dados lidos da página e não de uma ordem direta sua no chat. "
            "Para sua segurança, ações de escrita exigem seu comando explícito."
        )
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "security_origin_blocked",
            "status": status,
            "sucesso": False
        }

    # 3. Aluno não encontrado na tabela
    if status == "student_not_found":
        msg = f"Não encontrei o aluno '{aluno}' na turma aberta. Pode conferir se o nome está certinho ou se estamos na turma correta?"
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "check_student_name",
            "status": status,
            "sucesso": False
        }

    # 4. Navegador / Chrome fechado
    if status == "chrome_offline":
        msg = "O navegador da escola não está aberto. Pode clicar em 'Conectar Navegador' para começarmos?"
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "open_browser",
            "status": status,
            "sucesso": False
        }

    # 5. Erro de conexão com a aba / CDP
    if status == "cdp_error":
        msg = "Ops, perdi o contato com a janela do portal. Pode verificar se o navegador da escola continua aberto?"
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "reconnect_browser",
            "status": status,
            "sucesso": False
        }

    # 6. Linha do aluno achada, mas campos travados
    if status == "no_editable_inputs":
        msg = f"Encontrei a linha de {aluno}, mas os campos de nota desta tela parecem estar bloqueados para edição."
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "check_page_permissions",
            "status": status,
            "sucesso": False
        }

    # 7. Roster / lista de alunos lida com sucesso
    if status == "roster_extracted":
        total = task_result.get("total_linhas") or len(task_result.get("amostra_alunos") or [])
        amostra = task_result.get("amostra_alunos") or []
        nomes_curtos = ", ".join([a.split("|")[0].strip() for a in amostra[:3]])
        sufixo = f" (ex: {nomes_curtos}...)" if nomes_curtos else ""
        msg = f"Consegui ler a lista da turma! Encontrei {total} alunos na página{sufixo}."
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": None,
            "status": status,
            "sucesso": True
        }

    # 8. Estado da página detectado
    if status == "detected":
        titulo = task_result.get("titulo") or "portal escolar"
        msg = f"Navegador pronto! Estamos na página '{titulo}'."
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": None,
            "status": status,
            "sucesso": True
        }

    # 9. Falha no aprendizado ao vivo (DiscoveryOrchestrator não encontrou campo)
    if status in ("discovery_failed", "orchestration_failed"):
        campo_label = "falta" if "falta" in str(acao).lower() else "nota"
        msg = f"Não encontrei onde lançar {campo_label} nesta tela, você pode me mostrar clicando no lugar certo?"
        return {
            "human_message": msg,
            "needs_approval": False,
            "approval_card_data": None,
            "action_required": "point_and_click",
            "status": "point_and_click_required",
            "sucesso": False
        }

    # Fallback genérico limpo
    raw_msg = task_result.get("mensagem") or ""
    clean_msg = sanitize_message(raw_msg)
    if sucesso:
        msg = clean_msg or "Operação realizada com sucesso no portal."
    else:
        msg = clean_msg or "Não foi possível completar o preenchimento no portal. Por favor, verifique se a turma está aberta na tela."

    return {
        "human_message": msg,
        "needs_approval": False,
        "approval_card_data": None,
        "action_required": None,
        "status": status or ("ok" if sucesso else "error"),
        "sucesso": sucesso
    }
