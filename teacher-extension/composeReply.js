/**
 * composeReply.js — Compositor Único de Respostas de Status do Teacher AI
 * UMD (Universal Module Definition) para compatibilidade nativa:
 * - Chrome Extension Side Panel (via <script src>)
 * - Chrome Extension Service Worker (via importScripts)
 * - Next.js App / Node.js (via require / import)
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    module.exports.default = module.exports;
  } else {
    var exp = factory();
    root.composeReply = exp.composeReply;
    root.composeMultiStepReply = exp.composeMultiStepReply;
    root.TeacherComposeReply = exp;
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /**
   * @typedef {'verified' | 'mismatch' | 'not_found' | 'ambiguous' | 'error' | 'partial'} ReplyStatus
   *
   * @param {ReplyStatus} status
   * @param {Object} [details]
   * @param {string} [details.action]
   * @param {string} [details.target]
   * @param {string} [details.requested]
   * @param {string} [details.read_back]
   * @param {string} [details.message]
   * @param {string} [details.error]
   * @param {number} [details.completedSteps]
   * @param {number} [details.totalSteps]
   * @param {number} [details.maxTurns]
   * @param {Array<string>} [details.candidates]
   * @returns {string}
   */
  function composeReply(status, details) {
    details = details || {};
    var target = details.target || details.requested || '';

    switch (status) {
      case 'verified':
        if (!details.requested || !details.read_back) {
          throw new Error("composeReply('verified') exige { requested, read_back } comprovados.");
        }
        var verifiedTarget = details.read_back || details.requested;
        if (details.action === 'select' || details.action === 'filter') {
          return 'Filtro "' + verifiedTarget + '" selecionado e conferido no portal.';
        }
        if (details.action === 'navigate' || details.action === 'tab') {
          return 'Navegação para a aba "' + verifiedTarget + '" concluída e confirmada.';
        }
        if (details.action === 'click') {
          return 'Ação "' + verifiedTarget + '" acionada e confirmada na tela.';
        }
        return 'Operação "' + verifiedTarget + '" realizada e verificada no portal escolar.';

      case 'mismatch':
        return 'Divergência detectada no portal: solicitei "' + (details.requested || target) +
               '", mas o campo permaneceu com "' + (details.read_back || 'valor anterior') + '".';

      case 'not_found':
        return 'Não encontrei a opção ou elemento "' + target + '" na tela atual do portal.';

      case 'ambiguous':
        var opts = (details.candidates && details.candidates.length)
          ? ' Opções encontradas: ' + details.candidates.join(', ') + '.'
          : '';
        return 'Encontrei mais de uma correspondência para "' + target + '".' + opts + ' Pode me indicar qual deseja?';

      case 'partial':
        var done = details.completedSteps != null ? details.completedSteps : 0;
        var total = details.totalSteps != null ? details.totalSteps : 0;
        var maxN = details.maxTurns != null ? details.maxTurns : 12;
        var nav = details.navTarget || '';
        var act = details.pendingAction || details.primaryAction || '';
        if (nav && act) {
          return 'Naveguei até ' + nav + ', mas não consegui executar \'' + act + '\' automaticamente. Por favor, realize a ação manualmente.';
        }
        if (total > 0) {
          return 'Não consegui concluir todas as etapas em ' + maxN + ' passos. Concluí ' + done + ' de ' + total + ' etapas.';
        }
        return 'Não consegui concluir todas as etapas em ' + maxN + ' passos.';

      case 'error':
        return 'Não foi possível concluir a operação no portal: ' + (details.error || 'erro desconhecido');

      default:
        return 'Status da operação: ' + status;
    }
  }

  function composeMultiStepReply(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return 'Nenhuma etapa foi executada no portal.';
    }
    var lines = ['Etapas realizadas:'];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var mark = s.verified ? '✓' : '✗';
      lines.push(mark + ' ' + (s.description || s.target || ('Passo ' + (i + 1))));
    }
    return lines.join('\n');
  }

  return {
    composeReply: composeReply,
    composeMultiStepReply: composeMultiStepReply
  };
}));
