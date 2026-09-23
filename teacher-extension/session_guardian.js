/**
 * session_guardian.js — Monitor Ativo de Sessão Escolar (Keep-Alive Anti-Timeout)
 * 
 * Monitora o tempo de inatividade em abas de portais autenticados e envia
 * pings sintéticos leves e não-intrusivos para evitar logout acidental da professora.
 */

class SessionGuardian {
  constructor(timeoutMs = 15 * 60 * 1000, pingIntervalMs = 8 * 60 * 1000) {
    this.timeoutMs = timeoutMs;
    this.pingIntervalMs = pingIntervalMs;
    this.lastActivity = Date.now();
    this.lastPing = 0;
    this.monitoredTabId = null;
    this.timerId = null;
  }

  /**
   * Registra interação da professora ou da automação na aba.
   */
  recordActivity() {
    this.lastActivity = Date.now();
  }

  /**
   * Avalia se um ping de manutenção de sessão deve ser emitido.
   */
  shouldSendKeepAlive(now = Date.now()) {
    const timeSinceLastActivity = now - this.lastActivity;
    const timeSinceLastPing = now - this.lastPing;

    // Dispara se a inatividade ultrapassar o intervalo de ping mas ainda estiver dentro do timeout
    return (
      timeSinceLastActivity >= this.pingIntervalMs &&
      timeSinceLastActivity < this.timeoutMs &&
      timeSinceLastPing >= this.pingIntervalMs
    );
  }

  /**
   * Retorna os segundos restantes antes de uma provável expiração de sessão.
   */
  getRemainingSeconds(now = Date.now()) {
    const elapsed = now - this.lastActivity;
    const remaining = Math.max(0, this.timeoutMs - elapsed);
    return Math.round(remaining / 1000);
  }

  /**
   * Executa ping sintético leve na aba monitorada.
   */
  async triggerKeepAlive(tabId, fetchFn = null) {
    this.lastPing = Date.now();
    console.log(`[SessionGuardian] 💓 Ping de keep-alive enviado para aba ${tabId}`);

    if (fetchFn) {
      try {
        await fetchFn();
      } catch (e) {}
    }

    return {
      success: true,
      pingedAt: this.lastPing,
      tabId
    };
  }
}

// Exportação compatível com ambientes de teste e extensões
if (typeof window !== 'undefined') {
  window.SessionGuardian = SessionGuardian;
  window.__teacherSessionGuardian = new SessionGuardian();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SessionGuardian };
}
