document.addEventListener('DOMContentLoaded', async () => {
  const logEl = document.getElementById('status-log')
  const btnBackup = document.getElementById('btn-backup')
  const btnStatus = document.getElementById('btn-status')
  const passInput = document.getElementById('backup-passphrase')

  function log(msg) {
    if (logEl) {
      logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent
    }
  }

  async function checkStatus() {
    if (!window.teacherDesktop) {
      log('Aviso: Ambiente de pré-visualização web (bridge desktop não detectada).')
      return
    }

    try {
      const res = await window.teacherDesktop.invoke('app.status')
      if (res.success) {
        log(`Conectado ao núcleo local! Banco cifrado: OK | Ollama detectado: ${res.result?.hasOllama ? 'Sim' : 'Não'}`)
      } else {
        log(`Erro de status: ${res.error?.message || 'Falha desconhecida'}`)
      }
    } catch (err) {
      log(`Erro na chamada local: ${err.message}`)
    }
  }

  btnStatus?.addEventListener('click', checkStatus)

  btnBackup?.addEventListener('click', async () => {
    const passphrase = passInput?.value || ''
    if (passphrase.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    log('Gerando cópia de segurança cifrada...')
    try {
      const res = await window.teacherDesktop.invoke('data.backup', { passphrase })
      if (res.success) {
        log(`Cópia de segurança criada com sucesso! Tamanho: ${res.result?.bytes || 0} bytes.`)
        passInput.value = ''
        alert('Backup criado e salvo na pasta segura do usuário!')
      } else {
        log(`Falha ao gerar backup: ${res.error?.message}`)
        alert(`Erro: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro no backup: ${err.message}`)
    }
  })

  await checkStatus()
})
