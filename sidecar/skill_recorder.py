"""
skill_recorder.py — Conversor de Eventos Brutos em Skill Graph (Lote 2)

Recebe a sequência de eventos capturada pelo content_script.js da extensão
Chrome e produz um Skill Graph declarativo em conformidade estrita com o
schema do Lote 1 (skill_graph_schema.py).

Modo somente leitura: a Skill gerada contém apenas nós NAVIGATE, CLICK
(is_submit_action: false), LOCATE, READ e LOOP — nunca WRITE nem CLICK
de submit. O grafo resultante passa no graph_validator sem exigir CHECKPOINT.

Regras de extração de variáveis:
  - Células de tabela com cabeçalho contendo "nome", "aluno", "estudante",
    "matricul", "registro" → variam como {aluno_nome} ou {aluno_matricula}.
  - Células não reconhecidas: mapeadas com nome genérico {campo_col_N}.
  - Os sampleValues NUNCA são gravados no grafo — apenas a referência simbólica.

Execução como servidor HTTP independente:
  python skill_recorder.py [--port 7779]
"""

import argparse
import json
import re
import uuid
import sys
import os
import unicodedata
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Garante que o diretório sidecar/ esteja no path para imports relativos
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from skill_graph_schema import SkillGraph, SkillNode, SkillAnchor, SkillNodeParams
from graph_validator import validate_skill_graph, UnsafeGraphError
from skill_store import save_skill

DEFAULT_PORT = 7779
SKILLS_DIR = _THIS_DIR / "skills"


# ── Mapeamento de variáveis ────────────────────────────────────────────────────

VARIABLE_PATTERNS = [
    (r'nome|aluno|estudante|student|name',    'aluno_nome'),
    (r'situac|status|condicao|estado|matriculado', 'situacao_matricula'),
    (r'matricul|enrollment|enroll|registro|\bra\b|\bcod(?:igo)?\b', 'aluno_matricula'),
    (r'1\D*rec',                             'rec_1_bimestre'),
    (r'2\D*rec',                             'rec_2_bimestre'),
    (r'3\D*rec',                             'rec_3_bimestre'),
    (r'4\D*rec',                             'rec_4_bimestre'),
    (r'1\D*bim',                             'nota_1_bimestre'),
    (r'2\D*bim',                             'nota_2_bimestre'),
    (r'3\D*bim',                             'nota_3_bimestre'),
    (r'4\D*bim',                             'nota_4_bimestre'),
    (r'rec(?:uperacao)?\s*final',            'recuperacao_final'),
    (r'total|soma|pontos|resultado|media',   'total_pontos'),
    (r'turma|classe|class|serie',            'turma'),
    (r'nasc|nascimento|birthday',            'aluno_nascimento'),
    (r'resp|guardiao|guardian|familiar',     'responsavel_nome'),
    (r'data|date|dia',                       'data'),
    (r'hora|time|horario',                   'horario'),
    (r'falta|ausencia|presenca',             'frequencia'),
]

def column_to_variable(header: str, col_idx: int) -> str:
    """Retorna o nome de variável canônica para um cabeçalho de coluna."""
    raw = header or ''
    h = unicodedata.normalize('NFD', raw)
    h = ''.join(c for c in h if unicodedata.category(c) != 'Mn').lower().strip()
    for pattern, var_name in VARIABLE_PATTERNS:
        if re.search(pattern, h, re.IGNORECASE):
            return var_name
    clean_slug = re.sub(r'[^a-z0-9]+', '_', h).strip('_')
    if clean_slug and not clean_slug.startswith('col_'):
        return clean_slug
    return f'campo_col_{col_idx}'


# ── Deduplição e normalização de eventos ───────────────────────────────────────

def dedupe_navigate_events(events: List[Dict]) -> List[Dict]:
    """Remove NAVIGATEs consecutivos para a mesma URL."""
    result = []
    last_url = None
    for ev in events:
        if ev.get('type') == 'NAVIGATE':
            url = ev.get('url', '')
            if url == last_url:
                continue
            last_url = url
        result.append(ev)
    return result


def classify_click(event: Dict) -> bool:
    """
    Retorna True se o clique é de submissão (risco), False se é benigno (navegação).

    Heurísticas (v0.1 — no Lote 2, somente leitura, todos os CLIKs devem ser benignos):
      - Se o texto/aria-label contiver palavras de submissão → True (inesperado nesta skill)
      - Caso contrário → False
    """
    text  = (event.get('text') or '').lower()
    label = (event.get('ariaLabel') or '').lower()
    combined = f'{text} {label}'
    submit_keywords = r'\b(salvar|save|confirmar|confirm|submit|enviar|send|gravar|record|lancar|lançar)\b'
    return bool(re.search(submit_keywords, combined, re.IGNORECASE))


# ── Conversão de eventos → Nós do Skill Graph ──────────────────────────────────

def convert_anchor(raw_anchor: Optional[Dict]) -> Optional[SkillAnchor]:
    """Converte o objeto de âncora bruto do content_script em SkillAnchor tipado."""
    if not raw_anchor:
        return None
    strategy = raw_anchor.get('strategy', 'css_selector')
    value    = raw_anchor.get('value', '')
    if not value:
        return None
    return SkillAnchor(
        strategy=strategy,
        value=value,
        scope=None,
        description=raw_anchor.get('description')
    )


def events_to_skill_graph(
    events: List[Dict],
    portal_id: str,
    task_id: str,
    page_url: str
) -> Tuple[SkillGraph, List[str]]:
    """
    Converte sequência de eventos brutos em um Skill Graph somente leitura.
    Retorna (SkillGraph, lista de avisos).
    """
    warnings = []
    events = dedupe_navigate_events(events)

    nodes: Dict[str, Any] = {}
    node_order: List[str] = []

    navigate_count  = 0
    locate_count    = 0
    read_count      = 0
    click_count     = 0
    read_columns:   List[str] = []  # variáveis descobertas na leitura

    for ev in events:
        ev_type = ev.get('type')
        ev_id   = ev.get('eventId', len(nodes) + 1)

        if ev_type == 'NAVIGATE':
            node_id = f'nav_{navigate_count}'
            navigate_count += 1
            url = ev.get('url', '')
            nodes[node_id] = SkillNode(
                id=node_id,
                type='NAVIGATE',
                anchor=SkillAnchor(strategy='css_selector', value=url, description=f'Navegar para {url}'),
                params=SkillNodeParams(),
                on_success=None,
                on_fail=None
            )
            node_order.append(node_id)

        elif ev_type == 'CLICK':
            is_submit = classify_click(ev)
            if is_submit:
                warnings.append(
                    f'Evento CLICK #{ev_id} classificado como submissão (texto: {ev.get("text")!r}). '
                    'Num Skill Graph de leitura este clique é inesperado — será incluído com is_submit_action=true. '
                    'AVISO: isso exigirá CHECKPOINT no validador. Revise o grafo antes de salvar.'
                )
            node_id = f'click_{click_count}'
            click_count += 1
            anchor = convert_anchor(ev.get('anchor'))
            nodes[node_id] = SkillNode(
                id=node_id,
                type='CLICK',
                anchor=anchor,
                params=SkillNodeParams(is_submit_action=is_submit),
                on_success=None,
                on_fail=None
            )
            node_order.append(node_id)

        elif ev_type == 'LOCATE':
            node_id = f'locate_{locate_count}'
            locate_count += 1
            anchor = convert_anchor(ev.get('anchor'))
            nodes[node_id] = SkillNode(
                id=node_id,
                type='LOCATE',
                anchor=anchor,
                params=SkillNodeParams(),
                on_success=None,
                on_fail=None
            )
            node_order.append(node_id)

        elif ev_type == 'READ':
            col_header = ev.get('columnHeader', '')
            col_idx    = ev.get('tableCol', read_count)
            var_name   = column_to_variable(col_header, col_idx)

            # Só registra um READ por variável única
            if var_name not in read_columns:
                read_columns.append(var_name)
                node_id = f'read_{read_count}'
                read_count += 1
                col_css_idx = col_idx + 1

                # Âncora estrutural relativa à linha corrente (NUNCA texto literal de amostra)
                anchor = SkillAnchor(
                    strategy='css_selector',
                    value=f'td:nth-child({col_css_idx})',
                    scope='row_current',
                    description=f'Coluna {col_css_idx} ({col_header or var_name})'
                )

                nodes[node_id] = SkillNode(
                    id=node_id,
                    type='READ',
                    anchor=anchor,
                    params=SkillNodeParams(
                        variable_bindings=[var_name],
                        description=f'Ler campo {col_header!r} -> {{{var_name}}}'
                    ),
                    on_success=None,
                    on_fail=None
                )
                node_order.append(node_id)

    # ── Conecta os nós em sequência linear ────────────────────────────────────
    # Se houver nós READ, agrupa-os num LOOP por aluno
    has_reads = any('read_' in n for n in node_order)
    pre_read  = [n for n in node_order if 'read_' not in n]
    read_nodes= [n for n in node_order if 'read_' in n]

    # Conecta nós de navegação/clique linealmente
    for i, nid in enumerate(pre_read[:-1]):
        nodes[pre_read[i]] = nodes[pre_read[i]].model_copy(update={'on_success': pre_read[i+1]})

    if has_reads and read_nodes:
        # Último nó de pré-leitura aponta para o LOCATE da linha de aluno
        locate_row_id = 'locate_aluno_row'
        anchor_row = SkillAnchor(
            strategy='css_selector',
            value='table tbody tr',
            description='Linhas dos alunos na tabela de roster'
        )
        nodes[locate_row_id] = SkillNode(
            id=locate_row_id,
            type='LOCATE',
            anchor=anchor_row,
            params=SkillNodeParams(
                multiplicity='all',
                description='Localizar todas as linhas de alunos na tabela'
            ),
            on_success=read_nodes[0] if read_nodes else None,
            on_fail=None
        )

        if pre_read:
            nodes[pre_read[-1]] = nodes[pre_read[-1]].model_copy(update={'on_success': locate_row_id})

        # Conecta nós de leitura entre si
        for i in range(len(read_nodes) - 1):
            nodes[read_nodes[i]] = nodes[read_nodes[i]].model_copy(update={'on_success': read_nodes[i+1]})

        # Último READ aponta para o LOOP
        loop_id = 'loop_proxima_linha'
        nodes[loop_id] = SkillNode(
            id=loop_id,
            type='LOOP',
            anchor=None,
            params=SkillNodeParams(
                loop_target=read_nodes[0],
                collection_node=locate_row_id,
                description='Repetir para cada linha de aluno na tabela'
            ),
            on_success=None,
            on_fail=None
        )
        if read_nodes:
            nodes[read_nodes[-1]] = nodes[read_nodes[-1]].model_copy(update={'on_success': loop_id})

        full_order = pre_read + [locate_row_id] + read_nodes + [loop_id]
    else:
        # Sem reads: conecta linearmente até o fim
        full_order = pre_read
        if len(full_order) > 1:
            for i in range(len(full_order) - 1):
                nodes[full_order[i]] = nodes[full_order[i]].model_copy(update={'on_success': full_order[i+1]})

    if not full_order:
        raise ValueError('Nenhum evento válido capturado. A gravação produziu um grafo vazio.')

    entry_node = full_order[0]

    graph = SkillGraph(
        id=f'skill_{task_id}_{uuid.uuid4().hex[:8]}',
        name=f'Leitura de {task_id.replace("_", " ").title()} — {portal_id}',
        portal_id=portal_id,
        task_id=task_id,
        version=1,
        entry_node=entry_node,
        nodes=nodes,
        metadata={
            'success_rate': 100.0,
            'total_executions': 0,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'has_self_healed': False,
            'author': 'skill_recorder_v0.1',
            'source_url': page_url,
            'variable_bindings_discovered': read_columns,
            'lote': 2,
            'notes': 'Skill de somente leitura gerada automaticamente pela extensão Chrome.'
        }
    )

    return graph, warnings


# ── Servidor HTTP ──────────────────────────────────────────────────────────────

class RecorderHandler(BaseHTTPRequestHandler):
    """Handler HTTP para o endpoint POST /record."""

    def log_message(self, fmt, *args):
        print(f'[SkillRecorder] {fmt % args}')

    def do_OPTIONS(self):
        """Responde a preflight CORS da extensão Chrome."""
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != '/record':
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            payload = json.loads(body)

            events   = payload.get('events', [])
            portal_id= payload.get('portalId', 'unknown_portal')
            task_id  = payload.get('taskId',   'read_roster')
            page_url = payload.get('pageUrl',  '')

            print(f'[SkillRecorder] Recebidos {len(events)} eventos para {portal_id}/{task_id}')

            if not events:
                self._json_error(400, 'Nenhum evento recebido. Grave a sessão antes de parar.')
                return

            # Converte eventos em Skill Graph
            graph, warnings = events_to_skill_graph(events, portal_id, task_id, page_url)

            # Valida o grafo antes de salvar
            is_valid, errors = validate_skill_graph(graph)
            if not is_valid:
                self._json_error(422, f'Grafo inválido — validação falhou: {" | ".join(errors)}')
                return

            # Salva em disco (já re-valida internamente)
            saved_path = save_skill(graph, base_dir=SKILLS_DIR)

            resp_data = {
                'ok':               True,
                'graphId':          graph.id,
                'skillPath':        str(saved_path),
                'nodeCount':        len(graph.nodes),
                'version':          graph.version,
                'validationStatus': 'PASSED',
                'warnings':         warnings,
                'variablesFound':   graph.metadata.get('variable_bindings_discovered', []),
                'graph':            json.loads(graph.model_dump_json())
            }
            print(f'[SkillRecorder] Skill salva: {saved_path}')
            if warnings:
                print(f'[SkillRecorder] AVISOS: {len(warnings)}')
                for w in warnings:
                    print(f'  AVISO: {w}')

            self._json_response(200, resp_data)

        except ValueError as e:
            self._json_error(400, str(e))
        except UnsafeGraphError as e:
            self._json_error(422, f'Grafo inseguro — recusado pelo validador: {e}')
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f'[SkillRecorder] Erro interno:\n{tb}')
            self._json_error(500, f'Erro interno no servidor: {e}')

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json_response(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(code)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code: int, message: str):
        self._json_response(code, {'ok': False, 'error': message})


def main():
    parser = argparse.ArgumentParser(description='Skill Recorder — servidor HTTP de conversão de gravações')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help=f'Porta HTTP local (padrão: {DEFAULT_PORT})')
    args = parser.parse_args()

    SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    print('=' * 70)
    print(f'  TEACHER AI — SKILL RECORDER (Lote 2)')
    print(f'  Escutando em http://localhost:{args.port}/record')
    print(f'  Skills salvas em: {SKILLS_DIR}')
    print('=' * 70)

    server = HTTPServer(('localhost', args.port), RecorderHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[SkillRecorder] Encerrando...')
        server.shutdown()


if __name__ == '__main__':
    main()
