"""
run_live_machado.py — Executor do Teste Real da Camada 2 (Visão Real) contra o Machado Sobrinho

Garantias Inegociáveis Ativas:
1. 100% Read-Only: Nenhuma submissão ou alteração de dados no portal real.
2. Rate-limiting defensivo: Delays entre acessos para proteger o servidor da escola.
3. Descoberta Autônoma Genuína: Sem mapa pré-configurado.
4. Anonimização no Relatório: Mascara nomes no terminal para proteção LGPD.
5. Zero persistência automática: Para antes de salvar no banco até confirmação humana.
"""

import asyncio
import hashlib
import json
import os
import sys
import time
from typing import Dict, Any, Optional

# Adiciona o diretório do sidecar ao path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from cdp_connector import CDPConnector
from portal_discovery_agent import PortalDiscoveryAgent, DiscoveredSelectorMap
from portal_map_store import PortalMapStore
from capability_router import model_supports_vision

def mask_name(full_name: str) -> str:
    """Mascara o nome do aluno para exibição segura em logs/relatórios (ex: 'Ana J. F.')."""
    parts = full_name.strip().split()
    if not parts:
        return "Aluno Desconhecido"
    if len(parts) == 1:
        return f"{parts[0][:3]}***"
    first = parts[0]
    initials = " ".join([f"{p[0]}." for p in parts[1:]])
    return f"{first} {initials}"

async def main():
    print("=" * 70)
    print("  [PILOTO REAL] Camada 2: Descoberta Autonoma por Visao")
    print("  Alvo: Machado Sobrinho (paineldoaluno.com.br)")
    print("  Modo: ESTRITAMENTE LEITURA (100% Read-Only)")
    print("=" * 70)

    # 1. Verifica chaves BYOK no ambiente
    openai_key = os.getenv("OPENAI_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    provider = None
    model_name = None
    api_key = None

    if openai_key:
        provider = "openai"
        model_name = "gpt-4o"
        api_key = openai_key
    elif gemini_key:
        provider = "gemini"
        model_name = "gemini-2.0-flash"
        api_key = gemini_key
    elif anthropic_key:
        provider = "anthropic"
        model_name = "claude-3-5-sonnet-20241022"
        api_key = anthropic_key
    else:
        print("\n[ERRO BYOK] Nenhuma chave de API de visao detectada no ambiente!")
        print("Configure uma das seguintes variaveis antes de executar:")
        print("  set OPENAI_API_KEY=sk-...")
        print("  set GEMINI_API_KEY=AIzaSy...")
        print("  set ANTHROPIC_API_KEY=sk-ant-...")
        return

    byok = {
        "provider": provider,
        "model": model_name,
        "api_key": api_key
    }

    print(f"\n[BYOK] Modelo de Visao: {provider} / {model_name}")
    assert model_supports_vision(provider, model_name), f"Modelo {provider}/{model_name} nao suporta visao!"

    # 2. Conecta ao Chrome CDP na porta 9222
    connector = CDPConnector("http://localhost:9222")
    is_healthy, health_msg = connector.check_health()
    
    if not is_healthy:
        print(f"\n[ERRO CDP] Google Chrome nao detectado na porta 9222.")
        print(f"Detalhes: {health_msg}")
        print("\nPasso a passo para iniciar o Chrome com depuracao:")
        print("1. Feche as janelas normais do Chrome.")
        print("2. Execute no terminal: abrir-chrome-cdp.bat")
        print("   (ou execute: chrome.exe --remote-debugging-port=9222)")
        print("3. Faca login no Machado Sobrinho (paineldoaluno.com.br) e abra a tela de chamada da turma.")
        print("4. Execute este script novamente.")
        return

    print(f"[CDP] {health_msg} — Buscando aba do Machado Sobrinho...")
    context = await connector.connect()

    target_page = None
    for p in context.pages:
        u = p.url.lower()
        t = (await p.title()).lower()
        if "paineldoaluno" in u or "machado" in u or "machado" in t:
            target_page = p
            break

    if not target_page:
        # Pega a página ativa
        target_page = context.pages[0] if context.pages else None

    if not target_page:
        print("[ERRO] Nenhuma aba aberta encontrada no Chrome.")
        return

    page_url = target_page.url
    page_title = await target_page.title()
    print(f"[CDP] Aba selecionada: '{page_title}' ({page_url})")

    # 3. Detecta possíveis desafios de segurança (CAPTCHA, 2FA, Sessão expirada)
    is_blocked, block_reason = await connector.detect_security_challenge(target_page)
    if is_blocked:
        print(f"\n[ALERTA DE SEGURANCA] Desafio detectado na aba: {block_reason}")
        print("Por favor, resolva o desafio ou faca login manualmente na aba antes de prosseguir.")
        return

    # 4. Captura screenshot da tela do portal
    print("\n[VISAO] Capturando screenshot da tela do portal...")
    screenshot_bytes = await target_page.screenshot(full_page=False)
    img_hash = hashlib.sha256(screenshot_bytes).hexdigest()[:16]
    print(f"[VISAO] Screenshot capturada com sucesso: {len(screenshot_bytes):,} bytes | SHA256[:16]={img_hash}")

    # 5. Aciona o PortalDiscoveryAgent com o modelo de visão real
    print(f"[VISAO] Enviando imagem ao modelo '{provider}/{model_name}' para inferencia semantica de seletores...")
    agent = PortalDiscoveryAgent()
    t0 = time.perf_counter()
    discovered_map = await agent.discover_roster_map(target_page, byok)
    elapsed_s = time.perf_counter() - t0

    if not discovered_map:
        print(f"\n[FALHA] O modelo de visao nao conseguiu identificar seletores validos de roster na tela ({elapsed_s:.2f}s).")
        print("Verifique se a tela exibida contem a tabela de chamada de alunos.")
        return

    print(f"\n[SUCESSO VISUAL] Layout descoberto em {elapsed_s:.2f}s! Confianca: {discovered_map.confidence}")
    print("-" * 50)
    print("Mapa de Seletores Inferido:")
    print(f"  Tabela:          {discovered_map.roster_table}")
    print(f"  Coluna Nome:     Indice {discovered_map.name_column}")
    print(f"  Coluna ID/Mat:   Indice {discovered_map.id_column}")
    print(f"  Coluna Situacao: Indice {discovered_map.status_column}")
    print(f"  Badge NEE:       {discovered_map.nee_selector or '(Nenhum)'}")
    print(f"  Linhas Header:   {discovered_map.header_rows}")
    print(f"  Paginacao Tipo:  {discovered_map.pagination_type}")
    print(f"  Proxima Pagina:  {discovered_map.next_selector or '(Nenhum)'}")
    print("-" * 50)

    # 6. Extrai os alunos da página atual usando o mapa descoberto (Read-Only)
    print("\n[EXTRACAO] Extraindo lista de alunos com os seletores inferidos (100% Read-Only)...")
    students = await agent.extract_with_map(target_page, discovered_map, class_ref="1ª Turma Piloto")
    
    print(f"\n[RESULTADO DA EXTRACAO] Total de alunos identificados: {len(students)}")
    print("=" * 70)
    print(f"{'#':<4} | {'MATRÍCULA':<12} | {'NOME (MASCARADO LGPD)':<30} | {'SITUAÇÃO':<12} | {'NEE'}")
    print("-" * 70)
    
    for idx, s in enumerate(students, 1):
        m_name = mask_name(s.get("name", ""))
        m_id = s.get("rollNumber") or s.get("portal_native_id") or "—"
        m_status = s.get("status", "active")
        m_nee = "SIM" if s.get("nee_flag") else "não"
        print(f"{idx:<4} | {m_id:<12} | {m_name:<30} | {m_status:<12} | {m_nee}")
    print("=" * 70)

    print("\n[PRESERVACAO DE SEGURANCA] Nenhuma gravacao foi feita no banco de dados.")
    print("Metadados gerados:")
    print("  map_source:   'discovered'")
    print("  warn_teacher: 'new_portal'")
    print(f"  dominio:      '{PortalMapStore.extract_domain(page_url)}'")
    print("\nPor favor, compare a lista de alunos acima com o painel oficial da turma para confirmacao.")

if __name__ == "__main__":
    asyncio.run(main())
