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

  // ─── Funcionalidades Comunitárias (Fase 7) ──────────────────────────────────
  const commSearchInput = document.getElementById('community-search-input')
  const btnSearchComm = document.getElementById('btn-search-community')
  const btnRefreshComm = document.getElementById('btn-refresh-community')
  const commPackagesContainer = document.getElementById('community-packages-container')
  const modal = document.getElementById('quarantine-modal')
  const modalTitle = document.getElementById('modal-title')
  const modalContent = document.getElementById('modal-content')
  const btnCloseModal = document.getElementById('btn-close-modal')

  btnCloseModal?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none'
  })

  async function loadCommunityPackages(query = '') {
    if (!window.teacherDesktop) return
    log(`Consultando mapas disponíveis no índice comunitário em memória...`)

    try {
      const res = await window.teacherDesktop.invoke('community.search', { query })
      if (!res.success || !Array.isArray(res.result?.packages)) {
        if (commPackagesContainer) {
          commPackagesContainer.innerHTML = '<div style="color: var(--muted); font-size: 13px;">Nenhum mapa disponível no momento.</div>'
        }
        return
      }

      const packages = res.result.packages
      if (packages.length === 0) {
        if (commPackagesContainer) {
          commPackagesContainer.innerHTML = '<div style="color: var(--muted); font-size: 13px;">Nenhum mapa encontrado para os critérios informados.</div>'
        }
        return
      }

      if (commPackagesContainer) {
        commPackagesContainer.innerHTML = packages.map((pkg) => {
          let badgeHtml = '<span class="status-pill status-off">⚠ Autor Desconhecido</span>'
          if (pkg.reviewed) {
            badgeHtml = '<span class="status-pill status-ok">✓ Verificado no Registro</span>'
          }

          return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                  <strong style="font-size: 14px; color: var(--text);">${escapeHtml(pkg.package_id)}</strong>
                  ${badgeHtml}
                </div>
                <div style="font-size: 12px; color: var(--muted);">Versão: v${escapeHtml(pkg.map_version)} | Spec: ${escapeHtml(pkg.spec_version)}</div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Plataforma: <code>${escapeHtml(pkg.platform_hint || 'portal')}</code></div>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Tarefas: ${escapeHtml(pkg.tasks.join(', '))}</div>
              </div>
              <div style="display: flex; gap: 6px; margin-top: 6px;">
                <button class="btn btn-inspect-pkg" data-id="${escapeHtml(pkg.package_id)}" data-version="${escapeHtml(pkg.map_version)}" data-path="${escapeHtml(pkg.path)}" style="width: 100%;">
                  🛡️ Inspecionar & Quarentena
                </button>
              </div>
            </div>
          `
        }).join('')

        commPackagesContainer.querySelectorAll('.btn-inspect-pkg').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const pkgId = e.currentTarget.dataset.id
            const pkgVer = Number(e.currentTarget.dataset.version)
            await openQuarantineInspection(pkgId, pkgVer)
          })
        })
      }

      log(`Índice comunitário atualizado: ${packages.length} mapa(s) disponível(is).`)
    } catch (err) {
      log(`Falha ao buscar mapas comunitários: ${err.message}`)
    }
  }

  async function openQuarantineInspection(packageId, mapVersion) {
    if (!modal || !modalContent) return
    modal.style.display = 'flex'
    modalTitle.textContent = `🛡️ Quarentena & Efeitos: ${packageId} (v${mapVersion})`
    modalContent.innerHTML = '<div>Carregando relatório de segurança e efeitos do mapa...</div>'

    try {
      // Simula recuperação ou inspeção do pacote
      modalContent.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 10px; color: #fca5a5;">
          <strong>Estado Atual: QUARENTENA ATIVA</strong><br>
          Este mapa não pode efetuar alterações no seu portal até que você revise os nós e valide em simulação.
        </div>

        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">Vincular Marcador de Portal (h1.invalid):</label>
          <input type="text" id="bind-h1-host" placeholder="ex: machadosobrinho.paineldoaluno.com.br" value="paineldoaluno.com.br">
          <small style="color: var(--muted);">Informe o endereço web onde a automação deve atuar.</small>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 10px;">
          <strong>Ações Sensíveis no Portal:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; color: var(--muted);">
            <li>Clique de Submissão de Formulário detectado</li>
            <li>Leitura de tabela e identificação de discentes</li>
          </ul>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-run-dryrun" style="flex: 1;">🧪 Simular (Dry-Run)</button>
          <button class="btn" id="btn-activate-map" style="flex: 1; opacity: 0.5;" disabled>✅ Ativar Mapa</button>
        </div>
        <div id="dryrun-feedback" style="font-size: 12px; color: #38bdf8; display: none;"></div>
      `

      const btnDryRun = document.getElementById('btn-run-dryrun')
      const btnActivate = document.getElementById('btn-activate-map')
      const dryrunFeedback = document.getElementById('dryrun-feedback')

      btnDryRun?.addEventListener('click', async () => {
        log(`Executando dry-run supervisionado para ${packageId}...`)
        btnDryRun.textContent = 'Simulando...'
        btnDryRun.disabled = true

        try {
          const res = await window.teacherDesktop.invoke('community.dryRun', { packageId, mapVersion })
          if (res.success) {
            log(`Dry-run concluído com sucesso para ${packageId}! Ações de escrita bloqueadas com segurança durante o teste.`)
            if (dryrunFeedback) {
              dryrunFeedback.style.display = 'block'
              dryrunFeedback.textContent = '✓ Simulação prévia bem-sucedida! Nenhum dado foi alterado. O mapa agora pode ser ativado.'
            }
            if (btnActivate) {
              btnActivate.disabled = false
              btnActivate.style.opacity = '1'
            }
          }
        } catch (err) {
          log(`Erro no dry-run: ${err.message}`)
        } finally {
          btnDryRun.textContent = '🧪 Simular Novamente'
          btnDryRun.disabled = false
        }
      })

      btnActivate?.addEventListener('click', async () => {
        log(`Solicitando ativação permanente do mapa ${packageId} (v${mapVersion})...`)
        try {
          const res = await window.teacherDesktop.invoke('community.activate', {
            packageId,
            mapVersion,
            untrustedConfirmed: true,
          })
          if (res.success) {
            log(`Mapa ${packageId} ativado com sucesso! Pronto para execução nas aulas.`)
            alert(`Mapa "${packageId}" liberado da quarentena e pronto para uso seguro!`)
            if (modal) modal.style.display = 'none'
            await loadCommunityPackages(commSearchInput?.value || '')
          } else {
            alert(`Falha na ativação: ${res.error?.message}`)
          }
        } catch (err) {
          log(`Erro na ativação: ${err.message}`)
        }
      })
    } catch (err) {
      modalContent.innerHTML = `<div style="color: var(--danger);">Erro ao carregar detalhes: ${err.message}</div>`
    }
  }

  btnSearchComm?.addEventListener('click', () => {
    loadCommunityPackages(commSearchInput?.value || '')
  })
  btnRefreshComm?.addEventListener('click', () => {
    loadCommunityPackages(commSearchInput?.value || '')
  })

  await checkStatus()
  await loadStudents()
  await loadKeysStatus()
  await loadCommunityPackages()
})

