/**
 * compositeCommandHonesty.test.ts
 *
 * Validação rigorosa sem réplicas de código:
 * - Importa diretamente `extractPrimaryAction` e `extractNavigationTarget` de `teacher-extension/side_panel.js`.
 * - Importa diretamente `composeReply` de `teacher-extension/composeReply.js`.
 * - Testa a recusa estrita de 'verified' sem { requested, read_back }.
 * - Testa a remoção de texto livre em 'partial' (somente campos estruturados).
 */

import { describe, it, expect } from 'vitest';
import { composeReply } from '../teacher-extension/composeReply';

// Importa funções reais de produção diretamente de side_panel.js
// @ts-expect-error side_panel.js is a CommonJS module with browser/node dual support
import sidePanelModule from '../teacher-extension/side_panel';
const { extractPrimaryAction, extractNavigationTarget } = sidePanelModule;

describe('extractPrimaryAction – Produção real de side_panel.js', () => {
  it('detects "responder" in a composite command', () => {
    const result = extractPrimaryAction(
      'responder Rodrigo na aba início nos últimos recados'
    );
    expect(result).toBe('responder');
  });

  it('returns null for a pure nav command "ir para frequência"', () => {
    const result = extractPrimaryAction('ir para frequência');
    expect(result).toBeNull();
  });

  it('returns null for a pure nav command "va para diario"', () => {
    const result = extractPrimaryAction('va para diario');
    expect(result).toBeNull();
  });

  it('detects "enviar" in "enviar mensagem na aba início"', () => {
    const result = extractPrimaryAction('enviar mensagem na aba início');
    expect(result).toBe('enviar');
  });

  it('detects "lançar" (accented) in "lançar nota do Hugo na aba diário"', () => {
    const result = extractPrimaryAction('lançar nota do Hugo na aba diário');
    expect(result).toBe('lançar');
  });

  it('returns null for "navegar para arquivos" (nav verb, not an action verb)', () => {
    const result = extractPrimaryAction('navegar para arquivos');
    expect(result).toBeNull();
  });
});

describe('extractNavigationTarget – Produção real de side_panel.js', () => {
  it('extracts "recados" and NEVER "recados e" from "entrar em Recados e enviar recado para Alice"', () => {
    const target = extractNavigationTarget('entrar em Recados e enviar recado para Alice');
    expect(target).toBe('recados');
    expect(target).not.toBe('recados e');
  });

  it('extracts "frequencia" from "va para frequencia e lance falta pro Hugo"', () => {
    const target = extractNavigationTarget('va para frequencia e lance falta pro Hugo');
    expect(target).toBe('frequencia');
    expect(target).not.toContain(' e');
  });

  it('detects primaryAction "enviar" in "entrar em Recados e enviar recado para Alice"', () => {
    const action = extractPrimaryAction('entrar em Recados e enviar recado para Alice');
    expect(action).toBe('enviar');
  });
});

describe('composeReply – Regras estritas de honestidade estruturada (Decisão U6)', () => {
  it('RECUSA "verified" sem { requested, read_back } com erro explícito', () => {
    expect(() => {
      // @ts-expect-error teste de integridade com payload inválido
      composeReply('verified', { message: 'Mensagem livre' });
    }).toThrow("composeReply('verified') exige { requested, read_back } comprovados.");

    expect(() => {
      // @ts-expect-error teste de integridade sem read_back
      composeReply('verified', { requested: 'Frequência' });
    }).toThrow("composeReply('verified') exige { requested, read_back } comprovados.");

    expect(() => {
      // @ts-expect-error teste de integridade vazio
      composeReply('verified', {});
    }).toThrow("composeReply('verified') exige { requested, read_back } comprovados.");
  });

  it('aceita "verified" quando { requested, read_back } estão comprovados', () => {
    const navReply = composeReply('verified', {
      action: 'navigate',
      requested: 'frequência',
      read_back: 'frequência'
    });
    expect(navReply).toBe('Navegação para a aba "frequência" concluída e confirmada.');
    expect(navReply).not.toContain('Prontinho');

    const selectReply = composeReply('verified', {
      action: 'select',
      requested: '6º Ano A',
      read_back: '6º Ano A'
    });
    expect(selectReply).toBe('Filtro "6º Ano A" selecionado e conferido no portal.');

    const clickReply = composeReply('verified', {
      action: 'click',
      requested: 'Salvar Diário',
      read_back: 'Salvar Diário'
    });
    expect(clickReply).toBe('Ação "Salvar Diário" acionada e confirmada na tela.');
  });

  it('compõe "partial" exclusivamente a partir de campos estruturados (sem texto livre)', () => {
    const partialNavAction = composeReply('partial', {
      navTarget: 'início',
      pendingAction: 'responder'
    });
    expect(partialNavAction).toBe("Naveguei até início, mas não consegui executar 'responder' automaticamente. Por favor, realize a ação manualmente.");
    expect(partialNavAction).not.toContain('Prontinho');

    const partialSteps = composeReply('partial', {
      completedSteps: 2,
      totalSteps: 5,
      maxTurns: 12
    });
    expect(partialSteps).toBe('Não consegui concluir todas as etapas em 12 passos. Concluí 2 de 5 etapas.');

    const partialTimeout = composeReply('partial', {
      maxTurns: 8
    });
    expect(partialTimeout).toBe('Não consegui concluir todas as etapas em 8 passos.');
  });
});

describe('Composite command response rules (Bug 2 regression)', () => {
  const compositeScenarios = [
    {
      label: 'responder on início tab',
      navTarget: 'início',
      command: 'responder Rodrigo na aba início nos últimos recados',
    },
    {
      label: 'enviar on início tab',
      navTarget: 'início',
      command: 'enviar mensagem na aba início',
    },
    {
      label: 'lançar on diário tab',
      navTarget: 'diário',
      command: 'lançar nota do Hugo na aba diário',
    },
  ];

  for (const { label, navTarget, command } of compositeScenarios) {
    it(`${label}: response MUST NOT contain "Prontinho!" and MUST report partial execution`, () => {
      const primaryAction = extractPrimaryAction(command);
      expect(primaryAction).not.toBeNull();

      const message = composeReply('partial', {
        navTarget,
        pendingAction: primaryAction!
      });

      expect(message).not.toContain('Prontinho!');
      expect(message).toContain(primaryAction!);
      expect(message).toContain('não consegui executar');
    });
  }

  const pureNavScenarios = [
    {
      label: 'ir para frequência',
      navTarget: 'frequência',
      command: 'ir para frequência',
    },
    {
      label: 'va para diario',
      navTarget: 'diario',
      command: 'va para diario',
    },
    {
      label: 'navegar para arquivos',
      navTarget: 'arquivos',
      command: 'navegar para arquivos',
    },
  ];

  for (const { label, navTarget, command } of pureNavScenarios) {
    it(`${label}: primaryAction is null → full-success message is verified via composeReply`, () => {
      const primaryAction = extractPrimaryAction(command);
      expect(primaryAction).toBeNull();

      const message = composeReply('verified', {
        action: 'navigate',
        requested: navTarget,
        read_back: navTarget
      });

      expect(message).toBe(`Navegação para a aba "${navTarget}" concluída e confirmada.`);
      expect(message).not.toContain('não consegui executar');
      expect(message).not.toContain('Prontinho!');
    });
  }
});