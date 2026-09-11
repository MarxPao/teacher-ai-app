"""
manual_runner.py — Ponto de Entrada Manual & Servidor de Teste Local (Teacher AI)

Permite operar o sistema de ponta a ponta sem necessidade de Supabase ou reconhecimento de voz:
1. Verifica/Inicia o Chrome com perfil dedicado na porta CDP 9222.
2. Inicia servidor HTTP local (http://localhost:8765) com UI de Debug e endpoint POST /task.
3. Suporta execução direta via CLI (--task '{"acao": ...}' ou --interactive).
"""

import argparse
import asyncio
import json
import os
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Dict, Optional
import urllib.request

# Garante sidecar no sys.path
_SIDECAR_DIR = Path(__file__).resolve().parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from chrome_launcher import (
    launch_dedicated_chrome,
    check_cdp_health,
    get_open_tabs,
    CDP_PORT,
    PROFILE_DIR
)
from cdp_connector import CDPConnector
from navigation_state_machine import NavigationStateMachine, NavState
from safe_writer import SafeWriter

SERVER_PORT = 8765

HTML_DASHBOARD = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Teacher AI — Console de Homologação Manual</title>
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --border: #334155;
            --text: #f8fafc;
            --muted: #94a3b8;
            --primary: #3b82f6;
            --primary-hover: #2563eb;
            --success: #10b981;
            --danger: #ef4444;
            --code-bg: #0b1120;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 24px; display: flex; justify-content: center; }
        .container { max-width: 900px; width: 100%; display: flex; flex-direction: column; gap: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
        .header h1 { font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
        .badge { font-size: 12px; padding: 4px 10px; border-radius: 9999px; font-weight: 500; }
        .badge-online { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
        .badge-offline { background: #7f1d1d; color: #fca5a5; border: 1px solid #dc2626; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text); }
        .presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .btn-preset { background: #334155; color: var(--text); border: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; cursor: pointer; transition: 0.15s; }
        .btn-preset:hover { background: #475569; }
        textarea { width: 100%; height: 160px; background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; color: #38bdf8; font-family: Consolas, monospace; font-size: 13px; padding: 12px; resize: vertical; }
        textarea:focus { outline: 1px solid var(--primary); }
        .btn-exec { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.15s; width: 100%; margin-top: 12px; }
        .btn-exec:hover { background: var(--primary-hover); }
        .btn-exec:disabled { opacity: 0.5; cursor: not-allowed; }
        pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-family: Consolas, monospace; font-size: 13px; color: #a5f3fc; overflow-x: auto; max-height: 350px; }
        .info-box { font-size: 13px; color: var(--muted); line-height: 1.5; }
        .info-box code { background: #334155; color: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🦉 Teacher AI — Console Manual de Homologação</h1>
            <span id="cdp-badge" class="badge badge-offline">Verificando Chrome...</span>
        </div>

        <div class="card">
            <h2>1. Intenção Estruturada (JSON)</h2>
            <div class="presets">
                <button class="btn-preset" onclick="loadPreset('lancar_nota')">📝 Lançar Nota (Hugo 9.5)</button>
                <button class="btn-preset" onclick="loadPreset('lancar_falta')">❌ Lançar Falta (Milena)</button>
                <button class="btn-preset" onclick="loadPreset('read_roster')">📋 Ler Lista de Alunos</button>
                <button class="btn-preset" onclick="loadPreset('detect_state')">🧭 Apenas Detectar Estado</button>
            </div>
            <textarea id="payload-input">{
  "acao": "lancar_nota",
  "aluno": "HUGO HENRIQUE DE SOUZA",
  "nota": 9.5,
  "portal": "https://comunidade.ieducar.com.br",
  "turma": "01º ano A"
}</textarea>
            <button id="btn-run" class="btn-exec" onclick="submitTask()">▶️ Executar no Chrome Dedicado</button>
        </div>

        <div class="card">
            <h2>2. Resposta em Tempo Real & Rastreabilidade</h2>
            <pre id="output-box">// Aguardando envio de tarefa...</pre>
        </div>

        <div class="card info-box">
            <strong>Instruções de Uso:</strong>
            <p>1. Abra o Chrome com perfil dedicado: <code>python sidecar/chrome_launcher.py</code> ou <code>conectar-navegador.bat</code>.</p>
            <p>2. Faça login no portal escolar (ex: i-Educar ou Machado Sobrinho) na janela do Chrome dedicada.</p>
            <p>3. Envie a intenção acima ou use curl: <code>curl -X POST http://localhost:8765/task -H "Content-Type: application/json" -d '{"acao": "lancar_nota", ...}'</code>.</p>
        </div>
    </div>

    <script>
        const presets = {
            lancar_nota: {
                acao: "lancar_nota",
                aluno: "HUGO HENRIQUE DE SOUZA",
                nota: 9.5,
                portal: "https://comunidade.ieducar.com.br",
                turma: "01º ano A"
            },
            lancar_falta: {
                acao: "lancar_falta",
                aluno: "Milena gomes pinto",
                faltas: 1,
                portal: "https://comunidade.ieducar.com.br",
                turma: "01º ano A"
            },
            read_roster: {
                acao: "read_roster",
                portal: "https://comunidade.ieducar.com.br"
            },
            detect_state: {
                acao: "detect_state",
                portal: "https://comunidade.ieducar.com.br"
            }
        };

        function loadPreset(key) {
            document.getElementById('payload-input').value = JSON.stringify(presets[key], null, 2);
        }

        async function checkHealth() {
            const badge = document.getElementById('cdp-badge');
            try {
                const res = await fetch('/health');
                const data = await res.json();
                if (data.chrome_cdp) {
                    badge.className = 'badge badge-online';
                    badge.innerText = `● Chrome Conectado (:9222) — ${data.tabs_count} aba(s)`;
                } else {
                    badge.className = 'badge badge-offline';
                    badge.innerText = '○ Chrome Desconectado (:9222)';
                }
            } catch (e) {
                badge.className = 'badge badge-offline';
                badge.innerText = '○ Servidor Offline';
            }
        }

        setInterval(checkHealth, 3000);
        checkHealth();

        async function submitTask() {
            const btn = document.getElementById('btn-run');
            const out = document.getElementById('output-box');
            let payload;
            try {
                payload = JSON.parse(document.getElementById('payload-input').value);
            } catch (e) {
                alert('JSON inválido: ' + e.message);
                return;
            }

            btn.disabled = true;
            btn.innerText = '⏳ Executando no Chrome...';
            out.innerText = 'Enviando intenção para o sidecar...\n';

            try {
                const res = await fetch('/task', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                out.innerText = JSON.stringify(result, null, 2);
            } catch (e) {
                out.innerText = 'Erro na requisição: ' + e.message;
            } finally {
                btn.disabled = false;
                btn.innerText = '▶️ Executar no Chrome Dedicado';
                checkHealth();
            }
        }
    </script>
</body>
</html>
"""


async def execute_task_intent(intent: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executa a intenção estruturada diretamente no Chrome dedicado (:9222).
    Aplica NavigationStateMachine para detecção de barreiras (Login/CAPTCHA) e SafeWriter.
    """
    t0 = time.time()
    acao = intent.get("acao") or intent.get("action") or intent.get("action_type") or "detect_state"
    portal = intent.get("portal") or intent.get("portal_id") or ""
    aluno = intent.get("aluno") or intent.get("student") or ""
    nota = intent.get("nota") or intent.get("grade")
    turma = intent.get("turma") or ""

    trace = []
    trace.append(f"Recebida intencao: acao='{acao}', aluno='{aluno}', nota='{nota}', portal='{portal}'")

    # 1. Checa conectividade CDP
    cdp = CDPConnector(f"http://localhost:{CDP_PORT}")
    is_ok, msg = cdp.check_health()
    if not is_ok:
        return {
            "sucesso": False,
            "status": "chrome_offline",
            "mensagem": "Google Chrome dedicado (:9222) nao esta em execucao. Abra via 'python sidecar/chrome_launcher.py'.",
            "trace": trace,
            "tempo_ms": (time.time() - t0) * 1000
        }

    # 2. Conecta ao contexto do navegador
    try:
        context = await cdp.connect()
    except Exception as e:
        return {
            "sucesso": False,
            "status": "cdp_error",
            "mensagem": f"Falha ao conectar via CDP: {e}",
            "trace": trace,
            "tempo_ms": (time.time() - t0) * 1000
        }

    # 3. Identifica a página ativa
    page = None
    if portal:
        page = await cdp.find_portal_page(portal)
    if not page and context.pages:
        # Usa a última aba ativa
        page = context.pages[-1]

    if not page:
        page = await context.new_page()

    if portal:
        target_url = portal if (portal.startswith("http://") or portal.startswith("https://") or portal.startswith("file://")) else f"https://{portal}"
        if target_url.lower() not in page.url.lower():
            trace.append(f"Navegando para portal solicitado: {target_url}")
            await page.goto(target_url, wait_until="domcontentloaded")

    current_url = page.url
    page_title = await page.title()
    trace.append(f"Aba ativa: URL='{current_url}', Titulo='{page_title}'")

    # 4. Inspeciona o estado com NavigationStateMachine
    sm = NavigationStateMachine()
    nav_res = await sm.detect_current_state(page)
    trace.append(f"Estado detectado: {nav_res.state.value}")

    if nav_res.requires_human:
        return {
            "sucesso": False,
            "status": "human_action_required",
            "estado": nav_res.state.value,
            "mensagem": nav_res.human_message,
            "trace": trace + nav_res.trace,
            "tempo_ms": (time.time() - t0) * 1000
        }

    if acao == "detect_state":
        return {
            "sucesso": True,
            "status": "detected",
            "estado": nav_res.state.value,
            "url": current_url,
            "titulo": page_title,
            "trace": trace + nav_res.trace,
            "tempo_ms": (time.time() - t0) * 1000
        }

    # 5. Execução de Lançamento de Nota / Falta
    if acao in ("lancar_nota", "lancar_falta"):
        writer = SafeWriter(key_delay_ms=12)
        diff = {}
        screenshot_path = None

        # Localiza linha do aluno por texto semântico
        if aluno:
            row_locator = page.locator(f"table tr:has-text('{aluno}')")
            row_count = await row_locator.count()
            if row_count == 0:
                # Tenta primeiro nome
                first_name = aluno.split()[0]
                row_locator = page.locator(f"table tr:has-text('{first_name}')")
                row_count = await row_locator.count()

            if row_count == 0:
                return {
                    "sucesso": False,
                    "status": "student_not_found",
                    "mensagem": f"Aluno '{aluno}' nao encontrado na tabela visivel da pagina.",
                    "trace": trace,
                    "tempo_ms": (time.time() - t0) * 1000
                }

            row = row_locator.first
            trace.append(f"Linha do aluno '{aluno}' localizada com sucesso.")

            # Identifica inputs na linha
            inputs = await row.locator("input:not([type='hidden'])").all()
            if not inputs:
                return {
                    "sucesso": False,
                    "status": "no_editable_inputs",
                    "mensagem": f"Linha do aluno '{aluno}' encontrada, mas sem campos de texto/nota editaveis.",
                    "trace": trace,
                    "tempo_ms": (time.time() - t0) * 1000
                }

            target_input = inputs[0]
            val_before = await target_input.input_value()
            target_value = str(nota) if nota is not None else "1"

            # Preenchimento seguro com SafeWriter (press_sequentially + anti-drift)
            write_res = await writer.write_input(target_input, target_value)
            trace.append(f"Escrita executada: metodo='{write_res.method_used}', verificado={write_res.verified}")

            diff = {
                "aluno": aluno,
                "campo": "nota" if acao == "lancar_nota" else "falta",
                "antes": val_before,
                "depois": write_res.actual_value,
                "drift_detectado": write_res.drift_detected
            }

            # Captura screenshot de auditoria
            try:
                screenshots_dir = _SIDECAR_DIR / "screenshots"
                screenshots_dir.mkdir(parents=True, exist_ok=True)
                scr_file = screenshots_dir / f"audit_{int(time.time())}.png"
                await page.screenshot(path=str(scr_file))
                screenshot_path = str(scr_file)
                trace.append(f"Screenshot salvo em {screenshot_path}")
            except Exception as se:
                trace.append(f"Aviso screenshot: {se}")

            return {
                "sucesso": write_res.success,
                "status": "draft_completed_pending_submit",
                "acao": acao,
                "diff": diff,
                "screenshot": screenshot_path,
                "trace": trace,
                "tempo_ms": (time.time() - t0) * 1000
            }

    # 6. Leitura de Roster de Alunos
    if acao == "read_roster":
        rows = await page.locator("table tr").all_inner_texts()
        students = []
        for r in rows:
            clean = r.strip().replace("\n", " | ")
            if clean and any(c.isalpha() for c in clean):
                students.append(clean[:100])
        return {
            "sucesso": True,
            "status": "roster_extracted",
            "total_linhas": len(rows),
            "amostra_alunos": students[:10],
            "trace": trace,
            "tempo_ms": (time.time() - t0) * 1000
        }

    return {
        "sucesso": False,
        "status": "unsupported_action",
        "mensagem": f"Acao '{acao}' nao suportada no modo manual.",
        "trace": trace,
        "tempo_ms": (time.time() - t0) * 1000
    }


class ManualServerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_DASHBOARD.encode("utf-8"))
            return

        if self.path == "/health":
            is_ok, msg = check_cdp_health()
            tabs = get_open_tabs() if is_ok else []
            resp = {
                "chrome_cdp": is_ok,
                "message": msg,
                "tabs_count": len(tabs),
                "tabs": tabs[:5]
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/task":
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                intent = json.loads(body_bytes.decode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "JSON invalido", "details": str(e)}).encode("utf-8"))
                return

            print(f"\n[ManualServer] 📥 Recebida requisicao POST /task: {intent.get('acao')}")
            result = asyncio.run(execute_task_intent(intent))

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result, indent=2).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


def start_server(port: int = SERVER_PORT):
    server = HTTPServer(("127.0.0.1", port), ManualServerHandler)
    print("=" * 72)
    print(" 🦉 TEACHER AI — SERVIDOR DE HOMOLOGAÇÃO MANUAL LOCAL")
    print("=" * 72)
    print(f" • Painel Web Local:   👉 http://localhost:{port} 👈")
    print(f" • Endpoint REST:      👉 POST http://localhost:{port}/task 👈")
    print(f" • Chrome Dedicado:    👉 http://localhost:{CDP_PORT} (perfil: {PROFILE_DIR})")
    print("=" * 72)
    is_ok, msg = check_cdp_health()
    if is_ok:
        print(f" ✅ Chrome conectado e pronto na porta {CDP_PORT}.")
    else:
        print(f" ⚠️  Chrome não detectado na porta {CDP_PORT}.")
        print("    Execute 'python sidecar/chrome_launcher.py' ou abra 'conectar-navegador.bat'.")
    print("=" * 72)
    print(" Aguardando tarefas... Pressione Ctrl+C para encerrar.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[ManualServer] Encerrando servidor local.")
        server.server_close()


def run_cli_intent(intent_str: str):
    try:
        intent = json.loads(intent_str)
    except Exception as e:
        print(f"[ERRO] JSON invalido: {e}")
        sys.exit(1)

    print(f"\n[CLI] Executando intencao: {intent.get('acao')}...")
    result = asyncio.run(execute_task_intent(intent))
    print("\n" + json.dumps(result, indent=2))
    sys.exit(0 if result.get("sucesso") else 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Teacher AI — Executor Manual & Servidor de Teste Local")
    parser.add_argument("--server", action="store_true", default=True, help="Inicia servidor HTTP local (padrao)")
    parser.add_argument("--port", type=int, default=SERVER_PORT, help="Porta do servidor HTTP (padrao: 8765)")
    parser.add_argument("--task", type=str, help="JSON da intencao estruturada para executar via CLI e sair")
    parser.add_argument("--launch", action="store_true", help="Abre o Chrome com perfil dedicado antes de iniciar")

    args = parser.parse_args()

    if args.launch:
        launch_dedicated_chrome()

    if args.task:
        run_cli_intent(args.task)
    else:
        start_server(args.port)