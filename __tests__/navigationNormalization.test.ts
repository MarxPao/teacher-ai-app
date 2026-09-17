import { describe, it, expect } from 'vitest';

function normNav(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNavigationTarget(text: string): string | null {
  if (!text) return null;
  const normInput = normNav(text);
  let clean = normInput
    .replace(/^(?:ola|oi|ei|rafinha|por\s+favor|pfv|ajuda|ajude)\s*[,:]?\s*/gi, '')
    .replace(/\b(?:no\s+site|no\s+portal|no\s+sistema|via\s+chat|no\s+app).*/gi, '')
    .trim();

  const m = clean.match(
    /(?:entre|entra|entrar|vai|va|ir|navegue|navega|navegar|acesse|acessa|acessar|abra|abre|abrir|clique|clica|clicar|mostre|mostra)\s+(?:\b(?:em|no|na|nos|nas|para|pra|pro|pela|pelo)\b\s+)?(?:\b(?:a|o|os|as)\b\s+)?(?:\b(?:aba|menu|secao|guia|link|tela|pasta)\b\s+)?(?:\b(?:de|do|da|dos|das)\b\s+)?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)/i
  );
  if (m) {
    let target = m[1].trim()
      .replace(/^(?:a|o|os|as|de|do|da|dos|das)\s+/i, '')
      .replace(/\s+(?:no|na|do|da|de|pra|para|no\s+site|no\s+portal|do\s+portal|na\s+aba|via\s+chat).*/i, '')
      .trim();
    if (target && !['aluno', 'nota', 'falta', 'a nota', 'uma nota', 'site', 'portal'].includes(target.toLowerCase())) {
      return target;
    }
  }

  const m2 = clean.match(/(?:aba|menu|secao|guia)\s+([a-zA-Z0-9_-]+)/i);
  if (m2) {
    let target = m2[1].trim().replace(/^(?:de|do|da)\s+/i, '').trim();
    if (target) return target;
  }
  return null;
}

describe('Bug 1 - Accent normalization in navigation target extraction', () => {
  describe('frequencia / Frequencia', () => {
    it('should extract nav target from "va para frequencia" (no accent)', () => {
      const result = extractNavigationTarget('va para frequencia');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('frequencia');
    });
    it('should extract nav target from "va para Frequencia" (with accent stripped)', () => {
      const result = extractNavigationTarget('va para Frequencia');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('frequencia');
    });
    it('should produce equivalent nav targets for both forms', () => {
      const r1 = extractNavigationTarget('va para frequencia');
      const r2 = extractNavigationTarget('ir para Frequencia');
      expect(normNav(r1!)).toEqual(normNav(r2!));
    });
  });

  describe('conteudo ministrado', () => {
    it('should extract from "ir para conteudo ministrado" (no accent)', () => {
      const result = extractNavigationTarget('ir para conteudo ministrado');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('conteudo');
    });
  });

  describe('horarios', () => {
    it('should extract from "acesse horarios"', () => {
      const result = extractNavigationTarget('acesse horarios');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('horarios');
    });
  });

  describe('relatorios', () => {
    it('should extract from "abra relatorios"', () => {
      const result = extractNavigationTarget('abra relatorios');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('relatorios');
    });
  });

  describe('pure nav (no regression)', () => {
    it('should return null for non-nav commands', () => {
      expect(extractNavigationTarget('lanca nota do Hugo')).toBeNull();
    });
    it('should extract target from "ir para diario"', () => {
      const result = extractNavigationTarget('ir para diario');
      expect(result).not.toBeNull();
      expect(normNav(result!)).toContain('diario');
    });
  });
});
