import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
// TODO(fase-0): composeAssistantReply ainda não implementado
// import { composeAssistantReply, type OperationResult, type ExecutionEvidence } from '../lib/composeAssistantReply';
// import { normalizeClassificationResponse } from '../lib/commandClassifier';
type OperationResult = any;
type ExecutionEvidence = any;
const composeAssistantReply: any = undefined;
const normalizeClassificationResponse: any = undefined;

describe.skip('RFC-006 ADDENDUM — F1 & F4 Evidence-Gated Replies & Static Template Audit', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // F1: Auditoria Estática — Proibição de templates literais de sucesso fora do choke point
  // ───────────────────────────────────────────────────────────────────────────
  it('F1 Static Audit: templates literais de sucesso não aparecem fora de composeAssistantReply em side_panel.js', () => {
    const sidePanelPath = path.resolve(__dirname, '../teacher-extension/side_panel.js');
    const content = fs.readFileSync(sidePanelPath, 'utf-8');

    // Extrai o bloco de composeAssistantReply local
    const composeFuncMatch = content.match(/async function composeAssistantReply\(result\) \{[\s\S]*?\n\}/);
    expect(composeFuncMatch).not.toBeNull();
    const composeFuncBody = composeFuncMatch![0];

    // Remove o corpo da função composeAssistantReply do conteúdo inspecionado
    const outsideContent = content.replace(composeFuncBody, '/* composeAssistantReply body */');

    // Nenhuma ocorrência de templates literais de sucesso fora do choke point
    expect(outsideContent).not.toMatch(/appendAssistantChatMessage\(\s*[`'"](?:✅\s*)?Prontinho!/i);
    expect(outsideContent).not.toMatch(/appendAssistantChatMessage\(\s*[`'"](?:✅\s*)?Feito!/i);
    expect(outsideContent).not.toMatch(/appendAssistantChatMessage\(\s*[`'"].*com sucesso!/i);
    expect(outsideContent).not.toMatch(/itemLabel:\s*['"]dados da consulta['"]/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F1: Comportamento de composeAssistantReply com e sem ExecutionEvidence
  // ───────────────────────────────────────────────────────────────────────────
  describe('composeAssistantReply — Enforcement de Evidência Física', () => {
    it('sem ExecutionEvidence: NUNCA emite sucesso mesmo com success=true e verifiedState=true', () => {
      const result: OperationResult = {
        kind: 'read',
        success: true,
        verifiedState: true,
        humanSummary: { itemLabel: 'dados da consulta' }
      };

      const reply = composeAssistantReply(result);
      expect(reply).not.toContain('Prontinho!');
      expect(reply).not.toContain('Feito!');
      expect(reply).not.toContain('Encontrei dados da consulta');
      expect(reply).toContain('Nenhuma ação foi executada');
      expect(reply).toContain('estado original');
    });

    it('com ExecutionEvidence mas beforeValue === afterValue: emite não-executado pois controle não mudou', () => {
      const result: OperationResult = {
        kind: 'selection',
        success: true,
        verifiedState: true,
        evidence: {
          action: 'DISCOVERY_SELECT_FILTER',
          targetRef: 'filtro_turma',
          beforeValue: '',
          afterValue: '',
          timestamp: Date.now()
        },
        humanSummary: { destinationLabel: '6º Ano A' }
      };

      const reply = composeAssistantReply(result);
      expect(reply).not.toContain('Prontinho!');
      expect(reply).not.toContain('Feito!');
      expect(reply).toContain('Nenhuma alteração foi executada no portal escolar');
      expect(reply).toContain('permaneceu com o valor original');
    });

    it('com ExecutionEvidence comprovando mutação real: emite sucesso legítimo', () => {
      const result: OperationResult = {
        kind: 'selection',
        success: true,
        verifiedState: true,
        evidence: {
          action: 'DISCOVERY_SELECT_FILTER',
          targetRef: 'filtro_turma',
          beforeValue: '',
          afterValue: '6º Ano A',
          timestamp: Date.now()
        },
        humanSummary: { destinationLabel: '6º Ano A' }
      };

      const reply = composeAssistantReply(result);
      expect(reply).toContain('Prontinho! Feito! Selecionei 6º Ano A no portal para você. ✨');
    });

    it('com falha explícita (ELEMENT_NOT_LOCATED): emite mensagem pedagógica sem entrevista do DOM', () => {
      const result: OperationResult = {
        kind: 'navigation',
        success: false,
        verifiedState: false,
        failureCode: 'ELEMENT_NOT_LOCATED'
      };

      const reply = composeAssistantReply(result);
      expect(reply).toContain('Não localizei as informações solicitadas nesta tela do portal escolar');
      expect(reply).not.toContain('Prontinho!');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F4: Tabela de Regressão sobre os Utterances Observados e Variantes
  // ───────────────────────────────────────────────────────────────────────────
  describe('F4 Table-Driven Regression Suite — 8 Utterances + Variantes', () => {
    const testCases = [
      {
        id: 1,
        command: 'acesse diario de classe e selecione segundo semestre ... importe os horarios',
        targetControl: 'aba diário / segundo semestre',
        kind: 'navigation' as const,
        expectedBefore: '',
        expectedAfter: '2º Semestre'
      },
      {
        id: 2,
        command: 'va em frequencia, depois selecione sexto ano, lingua lingua inglesa, julho/2026 e depois visualize',
        targetControl: 'filtro_turma',
        kind: 'selection' as const,
        expectedBefore: '',
        expectedAfter: '6º Ano A'
      },
      {
        id: 3,
        command: 'va em frequencia, depois selecione sexto ano, lingua lingua inglesa, julho/2026 e depois clique em visualizar na mesma pagina',
        targetControl: 'btn_lancar_faltas',
        kind: 'selection' as const,
        expectedBefore: 'disabled',
        expectedAfter: 'enabled'
      },
      {
        id: 4,
        command: 'selecione os filtros corretamente em frequencia como eu pedi',
        targetControl: 'filtros_frequencia',
        kind: 'selection' as const,
        expectedBefore: '',
        expectedAfter: 'Frequência Configurada'
      },
      {
        id: 5,
        command: 'va em frequencia',
        targetControl: 'aba frequência',
        kind: 'navigation' as const,
        expectedBefore: 'Início',
        expectedAfter: 'Frequência'
      },
      {
        id: 6,
        command: 'selecione nos filtros a turma do setimo ano',
        targetControl: 'filtro_turma',
        kind: 'selection' as const,
        expectedBefore: '',
        expectedAfter: '7º Ano B'
      },
      {
        id: 7,
        command: 'selecione uma turma sexto ano',
        targetControl: 'filtro_turma',
        kind: 'selection' as const,
        expectedBefore: '',
        expectedAfter: '6º Ano A'
      },
      {
        id: 8,
        command: 'selecione ordem alfabetica',
        targetControl: 'ordem_alfabetica',
        kind: 'selection' as const,
        expectedBefore: 'padrao',
        expectedAfter: 'alfabetica'
      },
      // Variantes ordinais e de label
      {
        id: 9,
        command: 'selecione nos filtros a turma do oitavo ano',
        targetControl: 'filtro_turma',
        kind: 'selection' as const,
        expectedBefore: '',
        expectedAfter: '8º Ano C'
      },
      {
        id: 10,
        command: 'selecione a ordenacao alfabetica de alunos',
        targetControl: 'select_ordenacao',
        kind: 'selection' as const,
        expectedBefore: 'matricula',
        expectedAfter: 'Ordem Alfabética'
      }
    ];

    testCases.forEach((tc) => {
      it(`[Utterance ${tc.id}] "${tc.command}": com DOM inalterado, relata que nada foi executado`, () => {
        // Cenário Negativo: DOM permaneceu no placeholder (beforeValue === afterValue ou sem evidência)
        const unverifiedResult: OperationResult = {
          kind: tc.kind,
          success: false,
          verifiedState: false,
          failureCode: 'NOT_EXECUTED',
          humanSummary: { itemLabel: tc.targetControl }
        };

        const reply = composeAssistantReply(unverifiedResult);
        expect(reply).not.toContain('Prontinho!');
        expect(reply).not.toContain('Feito!');
        expect(reply).not.toContain('Encontrei dados da consulta');
        expect(reply).toContain('Nenhuma alteração foi realizada no portal escolar');
        expect(reply).toContain('permaneceram inalterados');
      });

      it(`[Utterance ${tc.id}] "${tc.command}": com DOM verificado por releitura, emite sucesso correspondente`, () => {
        // Cenário Positivo: releitura física comprova a transição de estado no DOM
        const evidence: ExecutionEvidence = {
          action: tc.kind === 'navigation' ? 'NAVIGATE_PORTAL_TAB' : 'DISCOVERY_SELECT_FILTER',
          targetRef: tc.targetControl,
          beforeValue: tc.expectedBefore,
          afterValue: tc.expectedAfter,
          timestamp: Date.now()
        };

        const verifiedResult: OperationResult = {
          kind: tc.kind,
          success: true,
          verifiedState: true,
          evidence,
          humanSummary: { destinationLabel: tc.expectedAfter, itemLabel: tc.targetControl }
        };

        const reply = composeAssistantReply(verifiedResult);
        expect(reply).toContain('Prontinho!');
        expect(reply).toContain(tc.expectedAfter);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F2: Verbos imperativos de UI nunca colapsam em leitura/consulta
  // ───────────────────────────────────────────────────────────────────────────
  describe('F2 Intent Routing — Imperative UI Verbs Never Route to Passive Read', () => {
    it('selecione nos filtros a turma do setimo ano não vira read_roster nem read_grades', () => {
      const raw = {
        intent: 'read_roster',
        confidence: 0.8,
        scope: 'single'
      };
      const classification = normalizeClassificationResponse(raw, 'selecione nos filtros a turma do setimo ano');
      expect(classification.intent).not.toBe('read_roster');
      expect(classification.intent).toBe('navigate_portal');
    });

    it('comando de baixa confiança ou ambíguo gera clarifying question (RFC-005 G4)', () => {
      const raw = {
        intent: 'navigate_portal',
        confidence: 0.5,
        scope: 'unclear'
      };
      const classification = normalizeClassificationResponse(raw, 'selecione ordem alfabetica');
      expect(classification.needsClarification).toBe(true);
      expect(classification.clarificationQuestion).toBeTruthy();
      expect(classification.targetTool).toBeUndefined();
    });
  });
});
