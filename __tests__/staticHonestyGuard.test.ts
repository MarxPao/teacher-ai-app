/**
 * staticHonestyGuard.test.ts
 *
 * Teste estático de integridade que falha o build se houver ocorrência de
 * strings de confirmação otimista ou de status de portal fora de composeReply.js.
 *
 * Alvos auditados:
 * - teacher-extension/side_panel.js
 * - teacher-extension/background.js
 * - app/api/agent/route.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Guardião Estático de Honestidade (Zero-Status no LLM & Compositor Único U6)', () => {
  const FORBIDDEN_ROGUE_CONFIRMATIONS = [
    'Prontinho!',
    'Feito!',
    'Perfeito!',
    'Selecionei',
    'Entrei na aba',
    'já está com'
  ];

  it('side_panel.js não contém strings de confirmação otimistas soltas fora de composeReply', () => {
    const sidePanelPath = path.resolve(__dirname, '../teacher-extension/side_panel.js');
    const content = fs.readFileSync(sidePanelPath, 'utf8');

    for (const phrase of FORBIDDEN_ROGUE_CONFIRMATIONS) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      expect(content).not.toMatch(regex);
    }
  });

  it('background.js não contém strings de confirmação otimistas soltas', () => {
    const bgPath = path.resolve(__dirname, '../teacher-extension/background.js');
    const content = fs.readFileSync(bgPath, 'utf8');

    for (const phrase of FORBIDDEN_ROGUE_CONFIRMATIONS) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'i');
      expect(content).not.toMatch(regex);
    }
  });

  it('app/api/agent/route.ts proíbe geração de status pelo LLM (Regra Zero-Status)', () => {
    const routePath = path.resolve(__dirname, '../app/api/agent/route.ts');
    const content = fs.readFileSync(routePath, 'utf8');

    // Confirma que a instrução de ZERO-STATUS está explicitamente presente no prompt do sistema
    expect(content).toContain('REGRA ESTRITA DE ZERO-STATUS');

    // Confirma que a instrução legada "confirme com frase curta" foi expurgada
    expect(content).not.toContain('confirme com frase curta');
  });

  it('composeReply.js é o único ponto de montagem de status do portal', () => {
    const composerPath = path.resolve(__dirname, '../teacher-extension/composeReply.js');
    const content = fs.readFileSync(composerPath, 'utf8');

    expect(content).toContain("composeReply('verified') exige { requested, read_back } comprovados.");
    expect(content).toContain('composeMultiStepReply');
  });
});
