document.addEventListener('DOMContentLoaded', async () => {
  const logEl = document.getElementById('status-log')
  const btnBackup = document.getElementById('btn-backup')
  const btnStatus = document.getElementById('btn-status')
  const btnRefreshStudents = document.getElementById('btn-refresh-students')
  const btnSaveKey = document.getElementById('btn-save-key')
  const passInput = document.getElementById('backup-passphrase')
  const keyProviderSelect = document.getElementById('key-provider')
  const keyInput = document.getElementById('key-input')
  const studentsTbody = document.getElementById('students-tbody')
  const keysContainer = document.getElementById('keys-status-container')

  function log(msg) {
    if (logEl) {
      logEl.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logEl.textContent
    }
  }

  function escapeHtml(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  async function checkStatus() {
    if (!window.teacherDesktop) {
      log('Aviso: Ambiente web de pré-visualização (bridge desktop indisponível).')
      return
    }

    try {
      const res = await window.teacherDesktop.invoke('app.status')
      if (res.success) {
        log(`Núcleo Desktop Operacional: Banco SQLite OK | Ollama detectado: ${res.result?.hasOllama ? 'Sim' : 'Não'}`)
      } else {
        log(`Erro de status: ${res.error?.message || 'Falha desconhecida'}`)
      }
    } catch (err) {
      log(`Erro na chamada local: ${err.message}`)
    }
  }

  async function loadStudents() {
    if (!window.teacherDesktop) return
    try {
      const res = await window.teacherDesktop.invoke('students.list')
      if (!res.success || !Array.isArray(res.result)) {
        if (studentsTbody) {
          studentsTbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted); text-align: center;">Nenhum discente cadastrado no SQLite cifrado.</td></tr>`
        }
        return
      }

      const students = res.result
      if (students.length === 0) {
        if (studentsTbody) {
          studentsTbody.innerHTML = `<tr><td colspan="5" style="color: var(--muted); text-align: center;">Nenhum discente cadastrado no banco local.</td></tr>`
        }
        return
      }

      if (studentsTbody) {
        studentsTbody.innerHTML = students.map((st) => `
          <tr>
            <td style="font-family: monospace; font-size: 11px;">${escapeHtml(st.id)}</td>
            <td style="font-weight: 600;">${escapeHtml(st.name)}</td>
            <td>${escapeHtml(st.matricula || st.portal_id || '—')}</td>
            <td>${escapeHtml(st.class_name || st.class_id || 'Principal')}</td>
            <td>
              <button class="btn btn-secondary btn-export-student" data-id="${escapeHtml(st.id)}" style="font-size: 11px; padding: 4px 8px;">Dossiê (Art. 18)</button>
              <button class="btn-danger btn-erase-student" data-id="${escapeHtml(st.id)}" data-name="${escapeHtml(st.name)}" style="font-size: 11px; padding: 4px 8px; margin-left: 4px;">Expurgo</button>
            </td>
          </tr>
        `).join('')

        // Handlers de Ações LGPD
        studentsTbody.querySelectorAll('.btn-export-student').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const studentId = e.target.dataset.id
            await exportStudent(studentId)
          })
        })

        studentsTbody.querySelectorAll('.btn-erase-student').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const studentId = e.target.dataset.id
            const studentName = e.target.dataset.name
            await eraseStudent(studentId, studentName)
          })
        })
      }
      log(`Lista de discentes carregada: ${students.length} discentes recuperados do SQLite cifrado.`)
    } catch (err) {
      log(`Falha ao carregar discentes: ${err.message}`)
    }
  }

  async function exportStudent(studentId) {
    log(`Exportando dossiê de titularidade LGPD para discente ${studentId}...`)
    try {
      const res = await window.teacherDesktop.invoke('data.exportStudent', { studentId })
      if (res.success) {
        const jsonStr = JSON.stringify(res.result, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dossie_aluno_${studentId}.json`
        a.click()
        URL.revokeObjectURL(url)
        log(`Dossiê do discente ${studentId} exportado com sucesso!`)
      } else {
        log(`Erro ao exportar dossiê: ${res.error?.message}`)
        alert(`Erro ao exportar: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro na exportação: ${err.message}`)
    }
  }

  async function eraseStudent(studentId, studentName) {
    const confirmed = confirm(
      `ATENÇÃO: Ação irreversível de Expurgo Seguro LGPD (Art. 18).\n\n` +
      `Tem certeza que deseja apagar todos os registros, notas e anonimizar a auditoria do aluno "${studentName}"?\n` +
      `Um hash irreversível SHA-256 será registrado para fins comprobatórios.`
    )
    if (!confirmed) return

    log(`Iniciando expurgo seguro para discente ${studentId}...`)
    try {
      const res = await window.teacherDesktop.invoke('data.eraseStudent', { studentId })
      if (res.success) {
        log(`Expurgo concluído! Registros removidos: ${res.result?.recordsPurged || 0}. Auditoria anonimizada.`)
        alert(`Expurgo concluído com sucesso conforme LGPD Art. 18!`)
        await loadStudents()
      } else {
        log(`Falha no expurgo: ${res.error?.message}`)
        alert(`Erro: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro no expurgo: ${err.message}`)
    }
  }

  async function loadKeysStatus() {
    if (!window.teacherDesktop) return
    try {
      const res = await window.teacherDesktop.invoke('keys.status')
      if (res.success && res.result?.status) {
        const status = res.result.status
        if (keysContainer) {
          keysContainer.innerHTML = Object.entries(status).map(([prov, isConfigured]) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="text-transform: capitalize; font-weight: 500;">${escapeHtml(prov)}</span>
              <span class="status-pill ${isConfigured ? 'status-ok' : 'status-off'}">
                ${isConfigured ? '✓ Configurado no DPAPI' : 'Não configurado'}
              </span>
            </div>
          `).join('')
        }
      }
    } catch (err) {
      log(`Erro ao verificar status das chaves: ${err.message}`)
    }
  }

  btnSaveKey?.addEventListener('click', async () => {
    const provider = keyProviderSelect?.value || 'groq'
    const key = keyInput?.value || ''
    if (!key.trim()) {
      alert('Por favor, informe a chave de API.')
      return
    }

    log(`Gravando chave de API para [${provider}] no cofre seguro DPAPI...`)
    try {
      const res = await window.teacherDesktop.invoke('keys.configure', { provider, key: key.trim() })
      if (res.success) {
        log(`Chave para [${provider}] salva no cofre do SO com sucesso!`)
        keyInput.value = ''
        alert(`Chave configurada com sucesso no cofre do sistema!`)
        await loadKeysStatus()
      } else {
        log(`Erro ao salvar chave: ${res.error?.message}`)
        alert(`Erro: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro ao configurar chave: ${err.message}`)
    }
  })

  btnRefreshStudents?.addEventListener('click', loadStudents)
  btnStatus?.addEventListener('click', checkStatus)

  btnBackup?.addEventListener('click', async () => {
    const passphrase = passInput?.value || ''
    if (passphrase.length < 6) {
      alert('A senha do backup deve ter pelo menos 6 caracteres.')
      return
    }

    log('Gerando cópia de segurança cifrada...')
    try {
      const res = await window.teacherDesktop.invoke('data.backup', { passphrase })
      if (res.success) {
        log(`Backup criado com sucesso! Tamanho: ${res.result?.bytes || 0} bytes. Local: ${res.result?.path}`)
        passInput.value = ''
        alert(`Backup criado e protegido por senha com sucesso!\nSalvo em: ${res.result?.path}`)
      } else {
        log(`Falha ao gerar backup: ${res.error?.message}`)
        alert(`Erro: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro no backup: ${err.message}`)
    }
  })

  await checkStatus()
  await loadStudents()
  await loadKeysStatus()
})
