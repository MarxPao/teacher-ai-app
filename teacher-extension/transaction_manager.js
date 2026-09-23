/**
 * transaction_manager.js — Motor Transacional de Lote com Rollback (Teacher AI)
 * 
 * Mantém um histórico seguro de mutações executadas no DOM para permitir
 * que a professora desfaça alterações em lote com um único clique (Undo).
 */

class TransactionManager {
  constructor(maxHistory = 10) {
    this.maxHistory = maxHistory;
    this.history = [];
  }

  /**
   * Registra um novo lote de alterações no DOM.
   * @param {string} batchId - Identificador único do lote
   * @param {string} description - Descrição amigável (ex: "Lançamento de presenças 8º B")
   * @param {Array<{selector: string, inputId: string, beforeVal: string, afterVal: string}>} changes
   */
  recordBatch(batchId, description, changes) {
    if (!changes || changes.length === 0) return;

    // Filtra mudanças reais e marca operações já idênticas
    const filteredChanges = [];
    let idempotentSkips = 0;

    changes.forEach(c => {
      const before = String(c.beforeVal || '').trim();
      const after = String(c.afterVal || '').trim();
      if (before === after) {
        idempotentSkips++;
      } else {
        filteredChanges.push({
          selector: c.selector || '',
          inputId: c.inputId || '',
          beforeVal: before,
          afterVal: after
        });
      }
    });

    if (filteredChanges.length === 0) {
      console.log(`[TransactionManager] ⚡ Lote ${batchId || ''} 100% idempotente (${idempotentSkips} campos já atualizados). Nenhuma mutação registrada.`);
      return { batchId: batchId || ('batch_' + Date.now()), idempotent: true, skipped: idempotentSkips };
    }

    const transaction = {
      batchId: batchId || ('batch_' + Date.now()),
      description: description || 'Alteração em lote no portal',
      timestamp: Date.now(),
      changes: filteredChanges,
      idempotentSkips
    };

    this.history.unshift(transaction);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    console.log(`[TransactionManager] 📦 Lote ${transaction.batchId} registrado (${transaction.changes.length} alterações reais, ${idempotentSkips} idempotentes).`);
    return transaction;
  }

  enqueueRetry(operation) {
    try {
      const queue = JSON.parse(sessionStorage.getItem('teacher_ai_retry_queue') || '[]');
      queue.push({
        ...operation,
        enqueuedAt: Date.now(),
        attempts: (operation.attempts || 0) + 1
      });
      sessionStorage.setItem('teacher_ai_retry_queue', JSON.stringify(queue));
      return queue.length;
    } catch (e) {
      return 0;
    }
  }

  getPendingRetries() {
    try {
      return JSON.parse(sessionStorage.getItem('teacher_ai_retry_queue') || '[]');
    } catch (e) {
      return [];
    }
  }

  clearRetries() {
    sessionStorage.removeItem('teacher_ai_retry_queue');
  }

  /**
   * Retorna a transação mais recente para inspeção ou rollback.
   */
  getLastTransaction() {
    return this.history.length > 0 ? this.history[0] : null;
  }

  /**
   * Executa o rollback de uma transação diretamente no DOM.
   * Restaura o valor anterior (beforeVal) em cada input registrado.
   */
  rollback(batchId = null) {
    const target = batchId
      ? this.history.find(t => t.batchId === batchId)
      : this.getLastTransaction();

    if (!target) {
      return { sucesso: false, mensagem: 'Nenhuma transação encontrada para desfazer.' };
    }

    let restoredCount = 0;
    const errors = [];

    target.changes.forEach(ch => {
      try {
        let el = null;
        if (ch.inputId) el = document.getElementById(ch.inputId);
        if (!el && ch.selector) el = document.querySelector(ch.selector);

        if (el) {
          el.value = ch.beforeVal;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          restoredCount++;
        } else {
          errors.push(`Elemento não encontrado para ${ch.selector || ch.inputId}`);
        }
      } catch (err) {
        errors.push(err.message);
      }
    });

    // Remove do histórico após desfeito
    this.history = this.history.filter(t => t.batchId !== target.batchId);

    console.log(`[TransactionManager] ↩️ Rollback concluído: ${restoredCount}/${target.changes.length} campos restaurados.`);
    return {
      sucesso: restoredCount > 0,
      restoredCount,
      total: target.changes.length,
      errors
    };
  }

  clear() {
    this.history = [];
  }
}

// Exportação global para extensões Chrome e scripts de contexto
if (typeof window !== 'undefined') {
  window.TransactionManager = TransactionManager;
  window.__teacherTransactionManager = new TransactionManager();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TransactionManager };
}
