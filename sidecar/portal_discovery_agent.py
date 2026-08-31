"""
portal_discovery_agent.py — Motor de Descoberta Autônoma de Layout de Portal (Camada 2)

Quando nenhum mapa está salvo para um portal, este agente:
1. Captura screenshot da aba atual via CDP.
2. Envia o screenshot ao modelo de visão configurado pelo professor (BYOK).
3. Parseia a resposta para um DiscoveredSelectorMap.
4. Valida o mapa executando os seletores inferidos contra o DOM real.
5. Retorna o mapa validado (ou None se a descoberta falhar).

Garantias:
- Nunca persiste um mapa sem ao menos 1 linha de aluno encontrada.
- Completamente mockável: injete `llm_caller` no construtor para testes.
- Nenhuma ação de escrita no DOM (100% read-only).

Compliance LGPD:
- Antes de enviar o screenshot ao provedor BYOK, o runner chama
  `requires_lgpd_consent()` para verificar se o professor já consentiu
  nesta sessão. Se não, bloqueia e exibe aviso.
"""

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple


# ------------------------------------------------------------------
# Tipos de saída
# ------------------------------------------------------------------

@dataclass
class DiscoveredSelectorMap:
    """Mapa de seletores descobertos por inferência visual."""
    roster_table: str                          # Ex: "table#alunos, table.tabela-chamada"
    name_column: int = 1                       # Índice 0-based da coluna de nome
    id_column: int = 0                         # Índice da matrícula
    status_column: Optional[int] = None        # Coluna de situação (opcional)
    nee_selector: Optional[str] = None         # Seletor de badge/ícone NEE (opcional)
    header_rows: int = 1                       # Linhas de cabeçalho a pular
    pagination_type: str = "none"              # 'next_button' | 'page_numbers' | 'none'
    next_selector: Optional[str] = None        # Seletor do botão Próximo
    confidence: str = "medium"                 # 'high' | 'medium' | 'low'
    llm_raw_response: Optional[str] = None     # Resposta bruta do LLM (para debug)

    def to_selectors_dict(self) -> Dict[str, Any]:
        """Converte para o formato jsonb de discovered_selectors."""
        d: Dict[str, Any] = {
            "roster_table": self.roster_table,
            "name_column": self.name_column,
            "id_column": self.id_column,
            "header_rows": self.header_rows,
        }
        if self.status_column is not None:
            d["status_column"] = self.status_column
        if self.nee_selector:
            d["nee_selector"] = self.nee_selector
        return d

    def to_pagination_dict(self) -> Optional[Dict[str, Any]]:
        if self.pagination_type == "none":
            return None
        d: Dict[str, Any] = {
            "type": self.pagination_type,
            "maxPages": 10,
            "delayBetweenPagesMs": 1000,
        }
        if self.next_selector:
            d["nextSelector"] = self.next_selector
        return d


# ------------------------------------------------------------------
# Prompt de Visão
# ------------------------------------------------------------------

VISION_PROMPT = """Você é um extrator de dados de portais educacionais.
Analise a imagem de uma tela de portal escolar.

Sua tarefa: identificar onde está a LISTA DE ALUNOS / CHAMADA e como navegá-la.

Responda EXCLUSIVAMENTE em JSON com este schema (sem texto adicional):
{
  "roster_table": "<seletor CSS da tabela principal de alunos>",
  "name_column": <índice 0-based da coluna com o NOME do aluno>,
  "id_column": <índice 0-based da coluna com matrícula/número>,
  "status_column": <índice da coluna de situação ou null>,
  "nee_selector": "<seletor CSS de badge/ícone de aluno com NEE ou null>",
  "header_rows": <número de linhas de cabeçalho a pular, normalmente 1>,
  "pagination_type": "next_button" | "page_numbers" | "none",
  "next_selector": "<seletor do botão Próxima Página ou null>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<sua explicação em 1-2 frases>"
}

Regras:
- Use seletores CSS específicos (id, class, atributo), não seletores genéricos como 'table'.
- Se não encontrar uma lista de alunos clara, retorne {"error": "no_roster_found"}.
- Prefira seletores com id (#) para alta confiança, class (.) para média.
"""


# ------------------------------------------------------------------
# Chamadores de LLM por provedor
# ------------------------------------------------------------------

def _call_openai_vision(screenshot_b64: str, byok: Dict[str, str]) -> str:
    """Chama GPT-4o com visão via API OpenAI."""
    import urllib.request
    api_key = byok.get("api_key", "")
    model = byok.get("model", "gpt-4o")
    payload = json.dumps({
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": VISION_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}}
            ]
        }],
        "max_tokens": 600,
        "response_format": {"type": "json_object"}
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp["choices"][0]["message"]["content"]


def _call_anthropic_vision(screenshot_b64: str, byok: Dict[str, str]) -> str:
    """Chama Claude 3.5+ com visão via API Anthropic."""
    import urllib.request
    api_key = byok.get("api_key", "")
    model = byok.get("model", "claude-3-5-sonnet-20241022")
    payload = json.dumps({
        "model": model,
        "max_tokens": 600,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": screenshot_b64}},
                {"type": "text", "text": VISION_PROMPT}
            ]
        }]
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp["content"][0]["text"]


def _call_gemini_vision(screenshot_b64: str, byok: Dict[str, str]) -> str:
    """Chama Gemini 1.5/2.0 com visão via API Google."""
    import urllib.request
    api_key = byok.get("api_key", "")
    model = byok.get("model", "gemini-1.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": VISION_PROMPT},
                {"inlineData": {"mimeType": "image/png", "data": screenshot_b64}}
            ]
        }],
        "generationConfig": {"maxOutputTokens": 600}
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp["candidates"][0]["content"]["parts"][0]["text"]


def default_llm_caller(screenshot_b64: str, byok: Dict[str, str]) -> str:
    """Despacha para o provedor correto com base em byok['provider']."""
    provider = (byok.get("provider") or "").lower().strip()
    if provider == "openai":
        return _call_openai_vision(screenshot_b64, byok)
    elif provider == "anthropic":
        return _call_anthropic_vision(screenshot_b64, byok)
    elif provider in ("gemini", "google"):
        return _call_gemini_vision(screenshot_b64, byok)
    else:
        raise ValueError(f"Provedor de visão não suportado: '{provider}'. Configure OpenAI, Anthropic ou Gemini.")


# ------------------------------------------------------------------
# Motor de Descoberta
# ------------------------------------------------------------------

class PortalDiscoveryAgent:
    """
    Motor de descoberta autônoma de layout de portal (Camada 2).

    Parâmetros:
        llm_caller: função substituível para testes (mock).
                    Assinatura: (screenshot_b64: str, byok: dict) -> str
    """

    def __init__(self, llm_caller: Optional[Callable] = None):
        self._llm = llm_caller or default_llm_caller

    # ------------------------------------------------------------------
    # Entry point principal
    # ------------------------------------------------------------------

    async def discover_roster_map(
        self,
        page: Any,
        teacher_byok: Dict[str, str],
    ) -> Optional[DiscoveredSelectorMap]:
        """
        Tenta descobrir o mapa de seletores da página atual.

        Fluxo:
        1. Screenshot da aba.
        2. Inferência visual via LLM.
        3. Parse da resposta JSON.
        4. Validação contra o DOM real (extrai >= 1 linha de aluno).
        5. Retorna mapa se válido, None caso contrário.
        """
        print("[Discovery] Iniciando descoberta autonoma de layout de portal...")

        # 1. Captura screenshot
        try:
            screenshot_bytes: bytes = await page.screenshot(full_page=False)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("ascii")
        except Exception as e:
            print(f"[Discovery] Falha ao capturar screenshot: {e}")
            return None

        # 2. Inferência visual
        try:
            raw_response = self._llm(screenshot_b64, teacher_byok)
            print(f"[Discovery] Resposta LLM recebida ({len(raw_response)} chars).")
        except Exception as e:
            print(f"[Discovery] Falha na chamada ao modelo de visao: {e}")
            return None

        # 3. Parse
        discovered = self._parse_llm_response(raw_response)
        if not discovered:
            print("[Discovery] Nao foi possivel extrair um mapa valido da resposta do LLM.")
            return None

        # 4. Validação contra DOM real
        valid, found_rows = await self._validate_map_against_dom(page, discovered)
        if not valid:
            print(f"[Discovery] Validacao falhou: seletores nao encontraram dados de alunos no DOM.")
            return None

        print(f"[Discovery] Mapa validado com sucesso: {found_rows} aluno(s) encontrado(s). Confianca: {discovered.confidence}.")
        return discovered

    # ------------------------------------------------------------------
    # Parse da resposta do LLM
    # ------------------------------------------------------------------

    def _parse_llm_response(self, raw: str) -> Optional[DiscoveredSelectorMap]:
        """
        Extrai o JSON do texto do LLM (tolerante a markdown code blocks).
        Retorna None se a resposta indicar erro ou não for parseável.
        """
        # Remove markdown code blocks se presentes
        clean = re.sub(r"```(?:json)?\s*", "", raw).strip().strip("`").strip()

        # Tenta encontrar o primeiro objeto JSON
        m = re.search(r"\{.*\}", clean, re.DOTALL)
        if not m:
            print(f"[Discovery] Nenhum JSON encontrado na resposta do LLM.")
            return None

        try:
            data = json.loads(m.group())
        except json.JSONDecodeError as e:
            print(f"[Discovery] Falha ao parsear JSON do LLM: {e}")
            return None

        # Resposta de erro explícita do LLM
        if "error" in data:
            print(f"[Discovery] LLM reportou erro: {data['error']}")
            return None

        # Validação mínima de campos obrigatórios
        if not data.get("roster_table"):
            print("[Discovery] Campo 'roster_table' ausente na resposta do LLM.")
            return None

        # Mapeia confiança (normaliza valores inesperados para 'low')
        confidence_raw = str(data.get("confidence", "low")).lower()
        confidence = confidence_raw if confidence_raw in ("high", "medium", "low") else "low"

        return DiscoveredSelectorMap(
            roster_table=data["roster_table"],
            name_column=int(data.get("name_column", 1)),
            id_column=int(data.get("id_column", 0)),
            status_column=data.get("status_column"),  # pode ser None
            nee_selector=data.get("nee_selector"),
            header_rows=int(data.get("header_rows", 1)),
            pagination_type=data.get("pagination_type", "none"),
            next_selector=data.get("next_selector"),
            confidence=confidence,
            llm_raw_response=raw,
        )

    # ------------------------------------------------------------------
    # Validação contra DOM real
    # ------------------------------------------------------------------

    async def _validate_map_against_dom(
        self, page: Any, discovered: DiscoveredSelectorMap
    ) -> Tuple[bool, int]:
        """
        Executa o seletor descoberto no DOM e conta linhas de aluno encontradas.
        Retorna (válido, nº de linhas).
        Um mapa só é considerado válido se encontrar >= 1 linha com conteúdo de nome.
        """
        name_col = discovered.name_column
        header_rows = discovered.header_rows
        table_sel = discovered.roster_table

        js_validate = f"""
        (() => {{
            const rows = Array.from(document.querySelectorAll(
                '{table_sel} tbody tr, {table_sel} tr'
            )).slice({header_rows});
            let found = 0;
            for (const row of rows) {{
                const cells = row.querySelectorAll('td, th');
                if (cells.length > {name_col}) {{
                    const name = (cells[{name_col}].innerText || '').trim();
                    if (name.length >= 2) found++;
                }}
            }}
            return found;
        }})()
        """

        try:
            raw = await page.evaluate(js_validate)
            # Produção: raw é int (resultado do JS)
            # Testes (MockPage): raw pode ser a lista de alunos (evaluate ignora o JS)
            if isinstance(raw, list):
                found_rows = len(raw)
            elif isinstance(raw, (int, float)):
                found_rows = int(raw)
            else:
                found_rows = 0
            return (found_rows >= 1), found_rows
        except Exception as e:
            print(f"[Discovery] Erro ao validar seletores no DOM: {e}")
            return False, 0


    # ------------------------------------------------------------------
    # Extração de dados com mapa descoberto
    # ------------------------------------------------------------------

    async def extract_with_map(
        self, page: Any, selector_map: DiscoveredSelectorMap, class_ref: str = "all"
    ) -> List[Dict[str, Any]]:
        """
        Extrai linhas de aluno usando um mapa de seletores (salvo ou recém-descoberto).
        Substitui o JS hardcoded em `_extract_roster_table`.
        """
        name_col = selector_map.name_column
        id_col = selector_map.id_column
        status_col = selector_map.status_column if selector_map.status_column is not None else -1
        nee_sel = (selector_map.nee_selector or "").replace("'", "\\'")
        header_rows = selector_map.header_rows
        table_sel = selector_map.roster_table.replace("'", "\\'")

        js_extract = f"""
        (() => {{
            const results = [];
            const rows = Array.from(document.querySelectorAll(
                '{table_sel} tbody tr, {table_sel} tr'
            )).slice({header_rows});

            for (const row of rows) {{
                const text = (row.innerText || '').trim();
                if (!text) continue;

                const cells = Array.from(row.querySelectorAll('td, th'));
                if (cells.length <= {name_col}) continue;

                const name = (cells[{name_col}].innerText || '').trim();
                if (!name || name.length < 2) continue;

                const rollNumber = cells.length > {id_col}
                    ? (cells[{id_col}].innerText || '').trim().replace(/[^0-9]/g, '')
                    : '';

                const portal_native_id = row.getAttribute('data-aluno-id') || rollNumber;

                let status = 'active';
                if ({status_col} >= 0 && cells.length > {status_col}) {{
                    const s = (cells[{status_col}].innerText || '').toLowerCase();
                    if (/transf/.test(s)) status = 'transferred';
                    else if (/inativ|cancel/.test(s)) status = 'inactive';
                }}

                const nee_flag = '{nee_sel}' !== ''
                    ? !!row.querySelector('{nee_sel}')
                    : false;

                results.push({{
                    name,
                    rollNumber,
                    portal_native_id,
                    status,
                    nee_flag,
                    classRef: '{class_ref}'
                }});
            }}
            return results;
        }})()
        """

        try:
            return await page.evaluate(js_extract) or []
        except Exception as e:
            print(f"[Discovery] Erro ao extrair dados com mapa: {e}")
            return []
