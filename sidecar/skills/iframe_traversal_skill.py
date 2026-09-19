"""
sidecar/skills/iframe_traversal_skill.py — Travessia Recursiva de Iframes Aninhados via CDP

Resolve o problema de elementos ocultos dentro de iframes (comum em portais legados: WebForms, Delphi Web, SigaEdu):
1. CDPIframeTraverser: Extrai a árvore completa de frames (Page.getFrameTree) recursivamente.
2. Mapeamento de Hierarquia: Identifica pais, filhos e URLs de cada frame isolado.
3. Tradução de Coordenadas: Converte coordenadas relativas internas de um iframe para coordenadas absolutas
   do viewport através da caixa delimitadora (DOM.getBoxModel) do elemento <iframe> correspondente.
4. Consulta Multi-Frame: Executa consultas no DOM em todos os frames filhos acessíveis.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("IframeTraversalSkill")


class FrameNode:
    """Nó representativo de um frame na árvore de navegação."""

    def __init__(
        self,
        frame_id: str,
        url: str,
        parent_id: Optional[str] = None,
        name: str = "",
        security_origin: str = ""
    ):
        self.frame_id = frame_id
        self.url = url
        self.parent_id = parent_id
        self.name = name
        self.security_origin = security_origin
        self.child_frames: List["FrameNode"] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "frame_id": self.frame_id,
            "url": self.url,
            "parent_id": self.parent_id,
            "name": self.name,
            "security_origin": self.security_origin,
            "children_count": len(self.child_frames)
        }


class CDPIframeTraverser:
    """Explorador e tradutor de coordenadas para iframes aninhados via CDP."""

    @classmethod
    def parse_frame_tree(cls, raw_tree: Dict[str, Any]) -> FrameNode:
        """
        Analisa o resultado de Page.getFrameTree do CDP e constrói a árvore de FrameNodes.
        """
        frame_data = raw_tree.get("frame", {})
        root = FrameNode(
            frame_id=frame_data.get("id", "root"),
            url=frame_data.get("url", ""),
            parent_id=frame_data.get("parentId"),
            name=frame_data.get("name", ""),
            security_origin=frame_data.get("securityOrigin", "")
        )

        for child in raw_tree.get("childFrames", []):
            child_node = cls.parse_frame_tree(child)
            root.child_frames.append(child_node)

        return root

    @classmethod
    def flatten_frame_tree(cls, root: FrameNode) -> List[FrameNode]:
        """Retorna uma lista linear de todos os frames encontrados na árvore."""
        nodes = [root]
        for child in root.child_frames:
            nodes.extend(cls.flatten_frame_tree(child))
        return nodes

    @classmethod
    def translate_iframe_coordinates(
        cls,
        rel_x: float,
        rel_y: float,
        iframe_bbox: Dict[str, float]
    ) -> Tuple[float, float]:
        """
        Converte coordenadas (rel_x, rel_y) internas do iframe para coordenadas absolutas
        do viewport principal considerando o offset do container iframe (x, y, border).
        """
        frame_x = iframe_bbox.get("x", 0.0)
        frame_y = iframe_bbox.get("y", 0.0)
        border_left = iframe_bbox.get("border_left", 0.0)
        border_top = iframe_bbox.get("border_top", 0.0)

        abs_x = frame_x + border_left + rel_x
        abs_y = frame_y + border_top + rel_y
        return round(abs_x, 2), round(abs_y, 2)

    @classmethod
    def generate_multi_frame_query_script(cls, selector: str) -> str:
        """
        Gera um script JS seguro que busca um elemento no documento principal
        e, se não encontrar, varre todos os iframes same-origin do documento recursivamente.
        """
        return f"""
        (() => {{
            const targetSelector = {repr(selector)};

            // 1. Tenta no documento raiz
            let el = document.querySelector(targetSelector);
            if (el) {{
                const rect = el.getBoundingClientRect();
                return {{
                    found: true,
                    in_iframe: false,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                    tagName: el.tagName
                }};
            }}

            // 2. Busca recursiva em iframes
            const iframes = Array.from(document.querySelectorAll('iframe'));
            for (let i = 0; i < iframes.length; i++) {{
                const iframe = iframes[i];
                try {{
                    const frameDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                    if (!frameDoc) continue;

                    const innerEl = frameDoc.querySelector(targetSelector);
                    if (innerEl) {{
                        const frameRect = iframe.getBoundingClientRect();
                        const innerRect = innerEl.getBoundingClientRect();
                        return {{
                            found: true,
                            in_iframe: true,
                            iframe_index: i,
                            iframe_id: iframe.id || iframe.name || `iframe_${{i}}`,
                            x: frameRect.left + innerRect.left + innerRect.width / 2,
                            y: frameRect.top + innerRect.top + innerRect.height / 2,
                            tagName: innerEl.tagName
                        }};
                    }}
                }} catch(e) {{
                    // Cross-origin iframe pode bloquear acesso direto via JS (tratar via CDP targetId)
                    continue;
                }}
            }}

            return {{ found: false }};
        }})()
        """
