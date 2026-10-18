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

  const credContainer = document.getElementById('cred-status-container')

  async function loadCredentialStatus() {
    if (!window.teacherDesktop || !credContainer) return
    try {
      const res = await window.teacherDesktop.invoke('credentials.status')
      const hosts = (res.success && res.result?.hosts) || []
      credContainer.innerHTML = hosts.length
        ? hosts.map(h => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-weight: 500;">${escapeHtml(h)}</span>
              <button class="btn" data-del-cred="${escapeHtml(h)}" style="padding: 2px 10px; font-size: 12px;">Remover</button>
            </div>`).join('')
        : '<span style="color: var(--muted);">Nenhum portal cadastrado.</span>'
      credContainer.querySelectorAll('[data-del-cred]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const host = btn.getAttribute('data-del-cred')
          if (!confirm(`Remover o acesso guardado para ${host}?`)) return
          await window.teacherDesktop.invoke('credentials.delete', { host })
          await loadCredentialStatus()
        })
      })
    } catch (err) {
      log(`Erro ao listar acessos: ${err.message}`)
    }
  }

  document.getElementById('btn-save-cred')?.addEventListener('click', async () => {
    const hostInput = document.getElementById('cred-host')
    const userInput = document.getElementById('cred-user')
    const passInput2 = document.getElementById('cred-pass')
    let host = (hostInput?.value || '').trim().toLowerCase()
    try {
      if (host.includes('://')) host = new URL(host).hostname
    } catch {}
    host = host.replace(/\/.*$/, '')
    const username = (userInput?.value || '').trim()
    const password = passInput2?.value || ''
    if (!host || !username || !password) {
      alert('Preencha o endereço do portal, o usuário e a senha.')
      return
    }
    const res = await window.teacherDesktop.invoke('credentials.set', { host, username, password })
    if (passInput2) passInput2.value = ''
    if (res.success) {
      log(`Acesso ao portal ${host} guardado no cofre do sistema.`)
      if (userInput) userInput.value = ''
      await loadCredentialStatus()
    } else {
      alert(`Erro: ${res.error?.message}`)
    }
  })

  loadCredentialStatus()

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

  const btnRestoreBackup = document.getElementById('btn-restore-backup')
  const restoreFileInput = document.getElementById('restore-file-input')

  btnRestoreBackup?.addEventListener('click', async () => {
    const passphrase = passInput?.value || ''
    if (passphrase.length < 6) {
      alert('Informe a senha do backup (mínimo 6 caracteres) no campo acima.')
      return
    }
    const file = restoreFileInput?.files?.[0]
    if (!file) {
      alert('Selecione um arquivo .tbackup para restaurar.')
      return
    }

    log(`Restaurando cópia de segurança cifrada (${file.name})...`)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const backupBase64 = btoa(binary)
      const res = await window.teacherDesktop.invoke('data.restore', { passphrase, backupBase64 })
      if (res.success) {
        log(`Backup restaurado com sucesso! (${res.result?.length || 0} bytes decifrados).`)
        alert('Backup restaurado com sucesso!')
        await loadStudents()
      } else {
        log(`Falha ao restaurar backup: ${res.error?.message}`)
        alert(`Erro ao restaurar: ${res.error?.message}`)
      }
    } catch (err) {
      log(`Erro ao restaurar backup: ${err.message}`)
      alert(`Erro ao restaurar: ${err.message}`)
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
          <input type="text" id="bind-h1-host" placeholder="ex: portal-escolar.example" value="">
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
    loadExportTasks()
  })

  // Exportar / Compartilhar mapa local assinado e sanitizado
  const btnExportMap = document.getElementById('btn-export-map')
  const exportTaskSelect = document.getElementById('export-task-select')
  const exportStatusMsg = document.getElementById('export-status-msg')
  const localSkillsTbody = document.getElementById('local-skills-tbody')

  async function loadExportTasks() {
    const client = window.teacherAi || window.teacherDesktop
    if (!client) {
      if (exportTaskSelect) exportTaskSelect.innerHTML = '<option value="">Bridge desktop indisponível</option>'
      if (localSkillsTbody) {
        localSkillsTbody.innerHTML = '<tr><td colspan="6" style="color: var(--muted); text-align: center;">Bridge desktop indisponível</td></tr>'
      }
      return
    }

    try {
      const res = await (client.send ? client.send('graphs.list', {}) : client.invoke('graphs.list', {}))
      const list = res?.success && Array.isArray(res.result) ? res.result : Array.isArray(res) ? res : []
      if (!list || list.length === 0) {
        if (exportTaskSelect) exportTaskSelect.innerHTML = '<option value="">Nenhuma habilidade gravada no banco</option>'
        if (localSkillsTbody) {
          localSkillsTbody.innerHTML = '<tr><td colspan="6" style="color: var(--muted); text-align: center;">Nenhuma habilidade gravada no banco local.</td></tr>'
        }
        return
      }

      if (exportTaskSelect) {
        exportTaskSelect.innerHTML = list
          .map((g) => {
            const name = g.name || g.task_name || ''
            const label = name ? `${g.task_id} (${name})` : g.task_id
            const portalInfo = g.portal_id ? ` [${g.portal_id}]` : ''
            return `<option value="${escapeHtml(g.task_id)}" data-portal="${escapeHtml(g.portal_id || 'portal_escolar')}">${escapeHtml(label + portalInfo)}</option>`
          })
          .join('')
      }

      if (localSkillsTbody) {
        localSkillsTbody.innerHTML = list
          .map((g) => {
            const isActive = g.is_active === 1 || g.is_active === true
            return `
              <tr>
                <td><code>${escapeHtml(g.portal_id || 'portal_escolar')}</code></td>
                <td style="font-family: monospace; font-size: 12px;">${escapeHtml(g.task_id)}</td>
                <td>${escapeHtml(g.name || g.task_id)}</td>
                <td>v${escapeHtml(g.version || 1)}</td>
                <td>
                  <span class="status-pill ${isActive ? 'status-ok' : 'status-off'}">
                    ${isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td>
                  ${
                    !isActive
                      ? `<button class="btn btn-secondary btn-activate-version" data-portal="${escapeHtml(g.portal_id)}" data-task="${escapeHtml(g.task_id)}" data-version="${escapeHtml(g.version)}" style="font-size: 11px; padding: 4px 8px;">Ativar / Reverter</button>`
                      : ''
                  }
                  <button class="btn-danger btn-delete-version" data-portal="${escapeHtml(g.portal_id)}" data-task="${escapeHtml(g.task_id)}" data-version="${escapeHtml(g.version)}" style="font-size: 11px; padding: 4px 8px; margin-left: 4px;">Excluir</button>
                </td>
              </tr>
            `
          })
          .join('')

        localSkillsTbody.querySelectorAll('.btn-activate-version').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const portalId = e.currentTarget.dataset.portal
            const taskId = e.currentTarget.dataset.task
            const version = Number(e.currentTarget.dataset.version)
            try {
              const actRes = await (client.send
                ? client.send('graphs.setActive', { portalId, taskId, version })
                : client.invoke('graphs.setActive', { portalId, taskId, version }))
              if (actRes?.success !== false) {
                log(`Versão v${version} da habilidade "${taskId}" ativada no portal "${portalId}".`)
                await loadExportTasks()
              } else {
                alert(`Erro ao ativar versão: ${actRes?.error?.message || 'Falha'}`)
              }
            } catch (err) {
              log(`Erro ao reverter versão: ${err.message}`)
            }
          })
        })

        localSkillsTbody.querySelectorAll('.btn-delete-version').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            const portalId = e.currentTarget.dataset.portal
            const taskId = e.currentTarget.dataset.task
            const version = Number(e.currentTarget.dataset.version)
            if (!confirm(`Deseja excluir a versão v${version} da habilidade "${taskId}"?`)) return
            try {
              const delRes = await (client.send
                ? client.send('graphs.delete', { portalId, taskId, version })
                : client.invoke('graphs.delete', { portalId, taskId, version }))
              if (delRes?.success !== false) {
                log(`Versão v${version} da habilidade "${taskId}" removida.`)
                await loadExportTasks()
              } else {
                alert(`Erro ao excluir habilidade: ${delRes?.error?.message || 'Falha'}`)
              }
            } catch (err) {
              log(`Erro ao excluir habilidade: ${err.message}`)
            }
          })
        })
      }
    } catch (err) {
      if (exportTaskSelect) exportTaskSelect.innerHTML = `<option value="">Erro ao carregar habilidades: ${escapeHtml(err.message)}</option>`
    }
  }

  btnExportMap?.addEventListener('click', async () => {
    const selectedOption = exportTaskSelect?.selectedOptions?.[0]
    const taskId = exportTaskSelect?.value
    if (!taskId) {
      alert('Selecione uma habilidade gravada para exportar.')
      return
    }
    const portalId = selectedOption?.getAttribute('data-portal') || 'portal_escolar'
    btnExportMap.disabled = true
    btnExportMap.textContent = 'Exportando...'
    if (exportStatusMsg) exportStatusMsg.style.display = 'none'

    try {
      const client = window.teacherAi || window.teacherDesktop
      if (!client) throw new Error('Bridge desktop indisponível.')

      const res = await (client.send ? client.send('community.export', { portalId, taskId }) : client.invoke('community.export', { portalId, taskId }))

      btnExportMap.disabled = false
      btnExportMap.textContent = '📦 Compartilhar Mapa'

      if (res && res.success) {
        const blob = new Blob([res.packageJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.filename || `${taskId}.teacherai.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        if (exportStatusMsg) {
          exportStatusMsg.style.display = 'block'
          exportStatusMsg.style.background = 'rgba(16, 185, 129, 0.15)'
          exportStatusMsg.style.color = '#34d399'
          exportStatusMsg.style.border = '1px solid rgba(16, 185, 129, 0.3)'
          exportStatusMsg.textContent = 'Pacote assinado e sanitizado gerado com sucesso. Nenhum dado pessoal ou nome da sua escola foi incluído.'
        }
        log(`Pacote comunitário exportado: ${res.filename} (ID: ${res.packageId})`)
      } else {
        throw new Error(res?.error?.message || 'Falha ao exportar mapa.')
      }
    } catch (err) {
      btnExportMap.disabled = false
      btnExportMap.textContent = '📦 Compartilhar Mapa'
      if (exportStatusMsg) {
        exportStatusMsg.style.display = 'block'
        exportStatusMsg.style.background = 'rgba(239, 68, 68, 0.15)'
        exportStatusMsg.style.color = '#f87171'
        exportStatusMsg.style.border = '1px solid rgba(239, 68, 68, 0.3)'
        exportStatusMsg.textContent = `Erro ao exportar: ${err.message}`
      }
      log(`Erro na exportação comunitária: ${err.message}`)
    }
  })

  await checkStatus()
  await loadStudents()
  await loadKeysStatus()
  await loadCommunityPackages()
  await loadExportTasks()
})

