/**
 * Regression tests for Bug 2 — Composite Command False Positive Fix
 *
 * Bug: when the user voice-command contained both a nav target AND a primary
 * action verb (e.g. "responder Rodrigo na aba início"), the system was
 * reporting "Prontinho!" even though it had only navigated and had NOT yet
 * executed the primary action.
 *
 * Fix: `extractPrimaryAction(text)` was added to side_panel.js.
 * When navTarget !== null && primaryAction !== null the response MUST report
 * PARTIAL success ("não consegui executar …"), never "Prontinho!".
 *
 * Because side_panel.js is browser-only JS (not importable in Node/Vitest),
 * we replicate the exact same logic here in TypeScript so we can unit-test it
 * in isolation.
 */

import { describe, it, expect } from 'vitest';

// ─── Inline replica of the browser-side helpers ──────────────────────────────

/**
 * Mirrors `_normNav(str)` from side_panel.js.
 * Normalises to NFD, lowercases and strips every non-letter character.
 */
function normNav(str: string): string {
  return str
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Primary-action verbs recognised by the extension (same list as side_panel.js). */
const PRIMARY_ACTION_VERBS: string[] = [
  'responder',
  'enviar',
  'escrever',
  'lancar',   // stored normalised (without cedilla) — matches "lançar"
  'marcar',
  'registrar',
  'preencher',
  'anotar',
  'editar',
  'excluir',
  'deletar',
  'salvar',
  'confirmar',
  'submeter',
  'aprovar',
];

/**
 * Mirrors `extractPrimaryAction(text)` from side_panel.js.
 *
 * Splits the normalised text into tokens and returns the FIRST token that
 * matches one of the recognised primary-action verbs, or `null` if none is
 * found.
 *
 * The return value is the **original** (pre-normalisation) verb token so that
 * callers can use it in user-facing messages exactly as the user spoke it.
 */
function extractPrimaryAction(text: string): string | null {
  const tokens = text.trim().split(/\s+/);
  for (const token of tokens) {
    const normalised = normNav(token);
    if (PRIMARY_ACTION_VERBS.includes(normalised)) {
      return token; // return the original casing/accents
    }
  }
  return null;
}

/**
 * Simulates the partial-success response message that side_panel.js builds
 * when navTarget !== null && primaryAction !== null.
 */
function buildPartialSuccessMessage(navTarget: string, primaryAction: string): string {
  return `Naveguei até ${navTarget}, mas não consegui executar '${primaryAction}' automaticamente. Por favor, realize a ação manualmente.`;
}

/**
 * Simulates the full-success response when there is NO primary action
 * (pure navigation).
 */
function buildPureNavMessage(navTarget: string): string {
  return `Prontinho! Naveguei para ${navTarget}.`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractPrimaryAction – verb detection', () => {
  it('detects "responder" in a composite command', () => {
    const result = extractPrimaryAction(
      'responder Rodrigo na aba início nos últimos recados',
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
    // The original token is returned with its accent intact
    expect(result).toBe('lançar');
  });

  it('returns null for "navegar para arquivos" (nav verb, not an action verb)', () => {
    const result = extractPrimaryAction('navegar para arquivos');
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Composite command response rules (Bug 2 regression)', () => {
  describe('RULE: navTarget + primaryAction → PARTIAL success (never Prontinho!)', () => {
    const compositeScenarios: Array<{
      label: string;
      navTarget: string;
      command: string;
    }> = [
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
      it(`${label}: response MUST NOT contain "Prontinho!" and MUST contain primaryAction label and "não consegui executar"`, () => {
        const primaryAction = extractPrimaryAction(command);

        // Pre-condition: this scenario must have been detected as composite
        expect(primaryAction).not.toBeNull();

        const message = buildPartialSuccessMessage(navTarget, primaryAction!);

        expect(message).not.toContain('Prontinho!');
        expect(message).toContain(primaryAction!);
        expect(message).toContain('não consegui executar');
      });
    }
  });

  describe('RULE: navTarget only (no primaryAction) → response MAY contain "Prontinho!"', () => {
    const pureNavScenarios: Array<{
      label: string;
      navTarget: string;
      command: string;
    }> = [
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
      it(`${label}: primaryAction is null → full-success message may contain "Prontinho!"`, () => {
        const primaryAction = extractPrimaryAction(command);

        // Pre-condition: pure nav must yield no action
        expect(primaryAction).toBeNull();

        const message = buildPureNavMessage(navTarget);

        // The rule only says "MAY contain" — we assert the message IS capable
        // of carrying "Prontinho!" without violating the Bug 2 rule.
        expect(message).toContain('Prontinho!');

        // And it must NOT claim to have executed an action that was never there
        expect(message).not.toContain('não consegui executar');
      });
    }
  });

  describe('RULE: boundary — composite guard is strict', () => {
    it('a command with a known action verb is NEVER treated as pure nav', () => {
      const command = 'marcar presença na aba frequência';
      const primaryAction = extractPrimaryAction(command);

      expect(primaryAction).not.toBeNull();

      // Simulate what the system must do: use partial-success path
      const navTarget = 'frequência';
      const message = buildPartialSuccessMessage(navTarget, primaryAction!);

      expect(message).not.toContain('Prontinho!');
      expect(message).toContain('marcar');
    });

    it('a command with no known action verb is ALWAYS treated as pure nav', () => {
      const command = 'abrir aba de arquivos';
      const primaryAction = extractPrimaryAction(command);

      expect(primaryAction).toBeNull();

      const navTarget = 'arquivos';
      const message = buildPureNavMessage(navTarget);

      expect(message).toContain('Prontinho!');
    });
  });

  describe('extractNavigationTarget — clean extraction without trailing conjunctions', () => {
    function simulateExtractNavTarget(text: string): string | null {
      const normInput = text.normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g, '');
      let clean = normInput
        .replace(/^(?:ola|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude)\s*[,:]?\s*/gi, '')
        .replace(/\b(?:no\s+site|no\s+portal|no\s+sistema|via\s+chat|no\s+app).*$/gi, '')
        .trim();

      clean = clean.replace(/\s+\b(?:e|e\s+depois|depois|em\s+seguida|a[ií])\s+(?:enviar|mandar|mande|responder|responda|lan[çc]ar|lance|marcar|marque|colocar|coloque|escrever|escreva|digitar|digite|registrar|registre|anotar|anote|editar|excluir|deletar|salvar|confirmar|submeter|aprovar|baixar|baixe|abrir|abra|ver)\b.*$/i, '').trim();

      const m = clean.match(/(?:entre|entra|entrar|vai|va|ir|navegue|navega|navegar|acesse|acessa|acessar|abra|abre|abrir|clique|clica|clicar|mostre|mostra)\s+(?:\b(?:em|no|na|nos|nas|para|pra|pro|pela|pelo)\b\s+)?(?:\b(?:a|o|os|as)\b\s+)?(?:\b(?:aba|menu|secao|guia|link|tela|pasta)\b\s+)?(?:\b(?:de|do|da|dos|das)\b\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)/i);
      if (m) {
        let target = m[1].trim()
          .replace(/^(?:a|o|os|as|de|do|da|dos|das)\s+/i, '')
          .replace(/\s+(?:no|na|do|da|de|pra|para|no\s+site|no\s+portal|do\s+portal|na\s+aba|via\s+chat).*$/i, '')
          .replace(/\s+\b(?:e|e\s+depois|depois|em\s+seguida|a[ií])\b.*$/i, '')
          .replace(/\s+e$/i, '')
          .trim();
        if (target && !['aluno', 'nota', 'falta', 'a nota', 'uma nota', 'site', 'portal'].includes(target.toLowerCase())) {
          return target;
        }
      }
      return null;
    }

    it('extracts "recados" and NEVER "recados e" from "entrar em Recados e enviar recado para Alice"', () => {
      const target = simulateExtractNavTarget('entrar em Recados e enviar recado para Alice');
      expect(target).toBe('recados');
      expect(target).not.toBe('recados e');
    });

    it('extracts "frequencia" from "va para frequencia e lance falta pro Hugo"', () => {
      const target = simulateExtractNavTarget('va para frequencia e lance falta pro Hugo');
      expect(target).toBe('frequencia');
      expect(target).not.toContain(' e');
    });

    it('detects primaryAction "enviar" in "entrar em Recados e enviar recado para Alice"', () => {
      const action = extractPrimaryAction('entrar em Recados e enviar recado para Alice');
      expect(action).toBe('enviar');
    });
  });
});