import { describe, it, expect } from 'vitest';

// 1. Simulação da função resolveActivePortalTab de background.js
async function simulateResolveActivePortalTab(
  explicitTabId: number | null,
  tabs: Array<{ id: number; url: string; active?: boolean; windowId?: number; focused?: boolean }>
) {
  if (explicitTabId) {
    const found = tabs.find(t => t.id === explicitTabId);
    if (found) return found.id;
  }

  // 1. Prioridade máxima: aba ativa na janela com foco / atual
  const activeTabs = tabs.filter(t => t.active && t.focused);
  const currentActive = activeTabs.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel'));
  if (currentActive) return currentActive.id;

  const anyActive = tabs.filter(t => t.active);
  const activeWeb = anyActive.find(t => t.url && (t.url.startsWith('http') || t.url.startsWith('file')) && !t.url.includes('side_panel'));
  if (activeWeb) return activeWeb.id;

  // 2. Fallback: abas de portal
  const isPortal = (url: string) => url.includes('ieducar') || url.includes('machado') || url.includes('escola');
  const portalTab = tabs.find(t => t.url && isPortal(t.url));
  if (portalTab) return portalTab.id;

  return null;
}

// 2. Simulação do extrator de Roster com suporte a checkboxes e selects
function simulateExtractRoster(rows: Array<{ text: string; hasCheckbox?: boolean; hasSelect?: boolean; hasText?: boolean }>) {
  const roster: Array<{ name: string; type: string }> = [];
  rows.forEach((r) => {
    const isHeader = r.text.toLowerCase().includes('aluno') || r.text.toLowerCase().includes('nome');
    if (isHeader) return;

    if (r.hasCheckbox) {
      roster.push({ name: r.text.trim(), type: 'checkbox' });
    } else if (r.hasSelect) {
      roster.push({ name: r.text.trim(), type: 'select' });
    } else if (r.hasText) {
      roster.push({ name: r.text.trim(), type: 'text' });
    }
  });
  return roster;
}

// 3. Simulação da política de exibição de cartões (Contrato Anti-Falso-Positivo)
function handleNaturalIntentResponse(data: {
  sucesso: boolean;
  aluno?: string;
  valor?: string | number;
  mensagem?: string;
  card?: any;
}) {
  const displayedCards: string[] = [];

  // Regra Estrita: Se houver card de aprovação
  if (data.card && data.sucesso) {
    displayedCards.push('APPROVAL_PREVIEW_CARD');
    return displayedCards;
  }

  // Se houver intenção de aluno, SEMPRE card de aprovação para o professor confirmar, NUNCA sucesso prematuro
  if (data.sucesso && data.aluno) {
    displayedCards.push('APPROVAL_PREVIEW_CARD');
    return displayedCards;
  }

  // Mensagem descritiva
  if (data.mensagem) {
    displayedCards.push('CHAT_MESSAGE');
    return displayedCards;
  }

  displayedCards.push('POINT_AND_CLICK_FALLBACK');
  return displayedCards;
}

// 4. Confirmação do DOM Write
function handleDomWriteResponse(response: { sucesso: boolean; verified: boolean; studentName: string }) {
  if (response && response.sucesso && response.verified) {
    return 'SHOW_SUCCESS_CARD';
  }
  return 'SHOW_HONEST_ERROR_CARD';
}

describe('Extension Responsiveness and Honesty Rules', () => {
  it('prioritizes currently active focused portal tab over background localhost or inactive tabs', async () => {
    const tabs = [
      { id: 101, url: 'http://localhost:3000/dashboard', active: false, focused: false },
      { id: 102, url: 'chrome-extension://xyz/side_panel.html', active: true, focused: true },
      { id: 103, url: 'https://comunidade.ieducar.com.br/diario', active: true, focused: true },
      { id: 104, url: 'https://machadosobrinho.com.br', active: false, focused: false },
    ];

    const targetId = await simulateResolveActivePortalTab(null, tabs);
    expect(targetId).toBe(103);
  });

  it('detects student roster when inputs are checkboxes (frequência / chamada)', () => {
    const tableRows = [
      { text: 'Aluno | Frequência 16/09', hasCheckbox: true },
      { text: 'Milena Gomes Pinto', hasCheckbox: true },
      { text: 'Hugo Henrique de Souza', hasCheckbox: true },
      { text: 'Rodrigo Responsável', hasCheckbox: false, hasText: true }
    ];

    const roster = simulateExtractRoster(tableRows);
    expect(roster.length).toBe(3);
    expect(roster[0].name).toBe('Milena Gomes Pinto');
    expect(roster[0].type).toBe('checkbox');
    expect(roster[1].name).toBe('Hugo Henrique de Souza');
  });

  it('CONTRACT: /natural_intent returns sucesso=true with student -> MUST show approval card, NEVER success card', () => {
    const backendData = {
      sucesso: true,
      aluno: 'Milena',
      valor: 1,
      mensagem: 'Lançamento de falta processado com sucesso'
    };

    const cards = handleNaturalIntentResponse(backendData);
    expect(cards).toContain('APPROVAL_PREVIEW_CARD');
    expect(cards).not.toContain('SHOW_SUCCESS_CARD');
  });

  it('CONTRACT: SHOW_SUCCESS_CARD is ONLY triggered when DOM write is verified', () => {
    // Caso 1: Gravação confirmada e observada no DOM
    const verifiedResponse = { sucesso: true, verified: true, studentName: 'Milena' };
    expect(handleDomWriteResponse(verifiedResponse)).toBe('SHOW_SUCCESS_CARD');

    // Caso 2: Resposta sem verificação no DOM
    const unverifiedResponse = { sucesso: true, verified: false, studentName: 'Milena' };
    expect(handleDomWriteResponse(unverifiedResponse)).toBe('SHOW_HONEST_ERROR_CARD');

    // Caso 3: Erro ou falha na escrita
    const failedResponse = { sucesso: false, verified: false, studentName: 'Milena' };
    expect(handleDomWriteResponse(failedResponse)).toBe('SHOW_HONEST_ERROR_CARD');
  });
});
