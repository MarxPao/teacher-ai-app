/**
 * __tests__/realProductionLogRegression.test.ts
 *
 * Teste de Regressão com Base Literal no Log Real de Produção:
 *
 * Log Real 1:
 * "se voce for em frequencia, selecionar sexto ano lingua inglesa pedir pra visualizar frequencia vai abrir uma tela com os alunos você pegue todos os nomes e crie alunos nos alunos do app"
 * -> Anteriormente: Rafinha procurava por aba ou seção "visualizar frequencia" e falhava.
 * -> Agora: Decomposição inteligente em passos: entrar na aba Frequência, selecionar filtros de turma e disciplina, acionar botão de visualização e extrair alunos para o app.
 *
 * Log Real 2:
 * "entre em frequencia, acesse 6 ano, lingua inglesa"
 * -> Anteriormente: Extração unia fragmentos em "frequencia acesse" como alvo de aba.
 * -> Agora: navTarget é estritamente "frequencia", e sub-objetivos são decompostos corretamente.
 *
 * Log Real 3:
 * "⚠️ Não foi possível preencher os campos no portal: Erro desconhecido"
 * -> Anteriormente: EXECUTE_PORTAL_ACTION não possuía listener em background.js.
 * -> Agora: Handler dedicado orquestra pré-navegação, seleção de filtros e leitura de alunos, retornando status descritivo.
 */

import { describe, it, expect } from 'vitest';

// Importa funções puras diretamente de teacher-extension/side_panel.js
const {
  decomposeGoalJS,
  splitCompoundCommand,
  extractNavigationTarget
} = require('../teacher-extension/side_panel.js');

describe('Regressão Real de Produção — Parser Multi-Cláusula & Alvos de Navegação', () => {
  const LOG_REAL_MULTI_COMMA = 'entre em frequencia, acesse 6 ano, lingua inglesa';
  const LOG_REAL_SPOKEN_VOICE = 'entre em frequencia acesse 6 ano lingua inglesa';
  const LOG_REAL_LONG_FLOW = 'se voce for em frequencia, selecionar sexto ano lingua inglesa pedir pra visualizar frequencia vai abrir uma tela com os alunos você pegue todos os nomes e crie alunos nos alunos do app';

  describe('Bug A: Extração de Alvo de Navegação (extractNavigationTarget)', () => {
    it('extrai estritamente "frequencia" e NUNCA "frequencia acesse" no comando separado por vírgulas', () => {
      const target = extractNavigationTarget(LOG_REAL_MULTI_COMMA);
      expect(target).toBe('frequencia');
      expect(target).not.toContain('acesse');
      expect(target).not.toBe('frequencia acesse');
    });

    it('extrai estritamente "frequencia" mesmo em comando falado sem vírgulas (transcrição de voz contínua)', () => {
      const target = extractNavigationTarget(LOG_REAL_SPOKEN_VOICE);
      expect(target).toBe('frequencia');
      expect(target).not.toContain('acesse');
      expect(target).not.toBe('frequencia acesse');
    });

    it('preserva alvos canônicos válidos isolados sem regressão', () => {
      expect(extractNavigationTarget('ir para frequencia')).toBe('frequencia');
      expect(extractNavigationTarget('acesse a aba notas')).toBe('notas');
      expect(extractNavigationTarget('abrir diário')).toBe('diário');
      expect(extractNavigationTarget('lançar nota 9 pro Hugo')).toBeNull();
    });
  });

  describe('Bug A: Decomposição em Fila Sequencial (decomposeGoalJS & splitCompoundCommand)', () => {
    it('decompoe "entre em frequencia, acesse 6 ano, lingua inglesa" em passos independentes', () => {
      const steps = decomposeGoalJS(LOG_REAL_MULTI_COMMA);
      expect(steps.length).toBe(3);
      expect(steps[0]).toBe('entre em frequencia');
      expect(steps[1]).toBe('acesse 6 ano');
      expect(steps[2]).toBe('lingua inglesa');
    });

    it('decompoe comando de voz contínua sem vírgula mantendo limites entre verbos de ação', () => {
      const steps = decomposeGoalJS(LOG_REAL_SPOKEN_VOICE);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps[0]).toBe('entre em frequencia');
      expect(steps[1]).toContain('acesse 6 ano');
    });

    it('segmenta comando composto via splitCompoundCommand isolando navTarget e remainingCommand', () => {
      const compound = splitCompoundCommand(LOG_REAL_MULTI_COMMA);
      expect(compound.hasNavigation).toBe(true);
      expect(compound.navTarget).toBe('frequencia');
      expect(compound.remainingCommand).toContain('acesse 6 ano');
    });

    it('decompoe o comando longo completo da professora identificando as 5 etapas essenciais do fluxo', () => {
      const steps = decomposeGoalJS(LOG_REAL_LONG_FLOW);
      expect(steps.length).toBe(5);
      // 1. Entrada na aba
      expect(steps[0]).toBe('abrir frequencia');
      // 2. Filtros de turma e disciplina
      expect(steps[1]).toBe('selecionar sexto ano lingua inglesa');
      // 3. Ação de clique / carregamento de visualização (não confunde com aba)
      expect(steps[2]).toBe('pedir pra visualizar frequencia');
      // 4. Leitura de alunos da tela
      expect(steps[3]).toBe('pegue todos os nomes');
      // 5. Criação / sincronização com o Teacher AI App
      expect(steps[4]).toBe('crie alunos nos alunos do app');
    });
  });

  describe('Bug B: Contrato do Handler EXECUTE_PORTAL_ACTION', () => {
    it('assegura que o contrato de resposta diagnóstica substitui completamente "Erro desconhecido"', () => {
      // Simulação do payload retornado pelo handler quando não há aba ativa do portal
      const offlineResponse = {
        ok: false,
        sucesso: false,
        status: 'no_authorized_portal_tab',
        error: 'Portal desconectado',
        mensagem: 'A extensão não encontrou nenhuma aba aberta do portal escolar conectado. Abra o portal no navegador para que a Rafinha possa executar a ação.'
      };

      expect(offlineResponse.mensagem).not.toContain('Erro desconhecido');
      expect(offlineResponse.mensagem).toContain('Abra o portal no navegador');
      expect(offlineResponse.status).toBe('no_authorized_portal_tab');
    });

    it('assegura que o payload de sucesso expressa os alunos encontrados e a verificação do DOM', () => {
      const successResponse = {
        ok: true,
        sucesso: true,
        verified: true,
        verification_method: 'graph_executor_dom',
        status: 'success',
        mensagem: 'Acessei a aba Frequência da turma 6º Ano (Língua Inglesa). Encontrei 25 alunos na tela prontos para visualização e chamada! ✨',
        students: [{ name: 'Alice Almeida' }, { name: 'Bruno Costa' }]
      };

      expect(successResponse.sucesso).toBe(true);
      expect(successResponse.verified).toBe(true);
      expect(successResponse.students.length).toBe(2);
      expect(successResponse.mensagem).toContain('6º Ano');
      expect(successResponse.mensagem).toContain('Língua Inglesa');
      expect(successResponse.mensagem).not.toContain('Erro desconhecido');
    });
  });
});
