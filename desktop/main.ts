import * as path from 'node:path'
import * as fs from 'node:fs'
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { NodeSqliteDriver } from './db/nodeSqliteDriver'
import { VaultManager } from './vault/safeStorage'
import { NamedPipeServer } from './nm/pipeServer'
import { LlmGateway } from './llm/llmGateway'
import { autoRegisterNativeMessagingHost } from './nativeHost/autoRegister'
import {
  MigrationRunner,
  SqlStudentRepository,
  SqlSkillGraphRepository,
  SqlAuditRepository,
  SqlConsentRepository,
  SqlSettingsRepository,
  ExportService,
  ErasureService,
  createEncryptedBackup,
  restoreEncryptedBackup,
  UI_ALLOWED_METHODS,
  MethodParamSchemas,
  MAX_MESSAGE_BYTES,
} from '../lib/desktop-core'
import {
  SqlCommunityRepository,
  searchRegistryPackages,
  executeImportPipeline,
  canActivate,
  PackageExporter,
} from '../lib/desktop-core/community'
import { validateGraph } from '../lib/contracts/skillgraph'
import * as crypto from 'node:crypto'

// ── Gap A3 (Parecer 2026-10-21): Token de Aprovação para graphs.setActive ──
// A extensão de Chrome pode chamar graphs.setActive via NativeMessaging sem
// que o processo Electron (desktop) tenha verificado aprovação humana.
// Este Map armazena tokens curto-prazo (TTL = 5 min) emitidos pelo Electron
// quando a professora confirma a ativação de uma skill na UI desktop.
// A extensão deve obter o token via `graphs.requestActivationToken` e passá-lo
// de volta em `graphs.setActive` dentro do TTL; sem token válido, setActive recusa.
const ACTIVATION_TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutos
interface ActivationToken {
  portalId: string
  taskId: string
  version: string
  expiresAt: number
}
const pendingActivationTokens = new Map<string, ActivationToken>()

/** Emite um token de aprovação curto-prazo após validação do caller.
 *  Chamado por `graphs.requestActivationToken` — reservado para a UI desktop
 *  ou para fluxos em que a professora explicitamente confirmou a ativação. */
function issueActivationToken(portalId: string, taskId: string, version: string): string {
  // Limpa tokens expirados antes de emitir novo
  const now = Date.now()
  for (const [k, t] of pendingActivationTokens.entries()) {
    if (t.expiresAt < now) pendingActivationTokens.delete(k)
  }
  const token = crypto.randomBytes(24).toString('hex')
  pendingActivationTokens.set(token, { portalId, taskId, version, expiresAt: now + ACTIVATION_TOKEN_TTL_MS })
  return token
}

/** Valida e consome um token de aprovação. Retorna true se válido, false caso contrário. */
function consumeActivationToken(token: string, portalId: string, taskId: string, version: string): boolean {
  const entry = pendingActivationTokens.get(token)
  if (!entry) return false
  // Consome token (uso único) independente do resultado
  pendingActivationTokens.delete(token)
  if (Date.now() > entry.expiresAt) return false
  if (entry.portalId !== portalId || entry.taskId !== taskId || entry.version !== version) return false
  return true
}

// 1. Configuração do App e Instância Única
app.setName('TeacherAI')
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let driver: NodeSqliteDriver | null = null
let vault: VaultManager | null = null
let dataKey: Buffer | null = null
let pipeServer: NamedPipeServer | null = null

// Repositórios
let studentRepo: SqlStudentRepository | null = null
let graphRepo: SqlSkillGraphRepository | null = null
let commRepo: SqlCommunityRepository | null = null
let auditRepo: SqlAuditRepository | null = null
let consentRepo: SqlConsentRepository | null = null
let settingsRepo: SqlSettingsRepository | null = null
let llmGateway: LlmGateway | null = null

async function executeBusinessMethod(method: string, params: any): Promise<any> {
  switch (method) {
    case 'app.status': {
      const hasOllama = llmGateway ? await llmGateway.checkOllamaStatus() : false
      return { ready: true, dbLocked: false, hasOllama }
    }

    case 'students.list':
      return await studentRepo?.listStudents(params)

    case 'students.upsertRoster':
    case 'students.upsertFromPortal':
      return await studentRepo?.upsertStudentsFromPortal(
        params.classId,
        params.students,
        params.source
      )

    case 'graphs.get':
      return await graphRepo?.get(params.portalId, params.taskId, params.version)

    case 'graphs.resolveActive':
      return await graphRepo?.resolveActive(params.host, params.taskId)

    case 'graphs.listActive':
      return await graphRepo?.listActive(params.host)

    case 'graphs.list':
      return await graphRepo?.list()

    case 'graphs.listVersions':
      return await graphRepo?.listVersions(params.portalId, params.taskId)

    // ── Gap A3: Emissão de token de aprovação ──
    // A extensão chama este endpoint ANTES de chamar graphs.setActive.
    // O Electron valida que a requisição vem de um contexto autorizado
    // (ipcMain handler verifica origin; NativeMessaging valida host).
    // O token retornado tem TTL de 5 min e é de uso único.
    case 'graphs.requestActivationToken': {
      const { portalId, taskId, version } = params || {}
      if (!portalId || !taskId || !version) {
        throw Object.assign(new Error('portalId, taskId e version são obrigatórios para emitir token de ativação.'), { code: 'E_MISSING_PARAMS' })
      }
      const token = issueActivationToken(String(portalId), String(taskId), String(version))
      return { success: true, token, expiresInMs: ACTIVATION_TOKEN_TTL_MS }
    }

    case 'graphs.setActive': {
      // ── Gap A3: Verificação de token de aprovação ──
      // graphs.setActive agora exige um approvalToken válido, de uso único,
      // emitido pelo Electron via graphs.requestActivationToken.
      // Sem token válido, a ativação é recusada para impedir que a extensão
      // ative skills autonomamente sem aprovação humana no desktop.
      const { portalId, taskId, version, approvalToken } = params || {}
      if (!approvalToken) {
        throw Object.assign(
          new Error('graphs.setActive requer approvalToken emitido via graphs.requestActivationToken (Gap A3: aprovação humana obrigatória).'),
          { code: 'E_ACTIVATION_TOKEN_MISSING' }
        )
      }
      const tokenValid = consumeActivationToken(String(approvalToken), String(portalId), String(taskId), String(version))
      if (!tokenValid) {
        throw Object.assign(
          new Error('Token de ativação inválido, expirado ou não corresponde ao grafo solicitado. Solicite um novo token via graphs.requestActivationToken.'),
          { code: 'E_ACTIVATION_TOKEN_INVALID' }
        )
      }
      const activated = await graphRepo?.setActive(portalId, taskId, version)
      return { success: Boolean(activated), portalId, taskId, version }
    }

    case 'graphs.delete': {
      const deleted = await graphRepo?.delete(params.portalId, params.taskId, params.version)
      return { success: Boolean(deleted), portalId: params.portalId, taskId: params.taskId, version: params.version }
    }

    case 'graphs.save': {
      const validation = validateGraph(params.graph as any)
      if (!validation.valid) {
        throw new Error(`E_GRAPH_INVALID: ${validation.errors.map((e: any) => e.message).join('; ')}`)
      }
      const taskId = String((params.graph as any)?.identity?.task_id || '')
      const isExplored =
        params.origin === 'exploration' ||
        taskId.startsWith('custom:nav-') ||
        taskId.startsWith('explored:')
      const shouldActivate = isExplored
        ? params.origin === 'teacher_approved' && params.activate === true
        : params.activate !== false
      const saved = await graphRepo?.save(params.graph as any, {
        activate: shouldActivate,
        origin: params.origin,
      })
      if (shouldActivate && saved) {
        await graphRepo?.setActive(saved.identity.portal_id, saved.identity.task_id, saved.identity.version)
      }
      return saved
    }

    case 'audit.append': {
      const id = await auditRepo?.append(params.entry)
      return { ack: true, id }
    }

    case 'nlu.parse': {
      const students = (await studentRepo?.listStudents()) || []
      if (llmGateway) {
        const engine = llmGateway.getConversationEngine()
        const engineRes = await engine.parse(params.text || '', {
          knownStudents: students,
          catalog: params.catalog,
        })
        return {
          ...engineRes.parsedIntent,
          replyText: engineRes.replyText,
          telemetry: engineRes.telemetry,
        }
      }
      return { intent: 'unknown', params: {}, supported: false, no_match: true }
    }

    case 'nlu.setEngineMode': {
      if (llmGateway && (params.mode === 'classic' || params.mode === 'eva')) {
        llmGateway.setEngineMode(params.mode)
        return { success: true, mode: llmGateway.getEngineMode() }
      }
      return { success: false, error: 'Modo inválido ou gateway indisponível' }
    }

    case 'nlu.getEngineMode': {
      return { mode: llmGateway?.getEngineMode() || 'classic' }
    }

    case 'agent.plan': {
      if (!llmGateway) throw new Error('LLM Gateway indisponível.')
      const res = await llmGateway.complete({
        prompt: `${params.system}\n\n${params.user}`,
        knownStudents: (await studentRepo?.listStudents()) || [],
        provider: params.provider,
        ...(params.images?.length ? { images: params.images } : {}),
      })
      return { text: res.text, ...(params.images?.length ? { imagesSent: res.imagesSent ?? 0 } : {}) }
    }

    case 'llm.generateText': {
      if (!llmGateway) throw new Error('LLM Gateway indisponível.')
      return await llmGateway.generateSafeText(params.instruction || '', { maxLength: params.maxLength })
    }

    case 'data.backup': {
      if (!dataKey) throw new Error('Chave de dados indisponível.')
      const backupData = JSON.stringify({
        students: await studentRepo?.listStudents(),
        exportedAt: new Date().toISOString(),
      })
      const backupBuffer = await createEncryptedBackup(backupData, params.passphrase)
      const backupPath = path.join(app.getPath('userData'), `backup-${Date.now()}.tbackup`)
      fs.writeFileSync(backupPath, backupBuffer)
      return { path: backupPath, bytes: backupBuffer.length }
    }

    case 'data.restore': {
      const buf = Buffer.from(params.backupBase64, 'base64')
      const restoredJson = await restoreEncryptedBackup(buf, params.passphrase)
      let studentsRestored = 0
      try {
        const parsed = JSON.parse(restoredJson)
        if (Array.isArray(parsed?.students) && studentRepo) {
          await studentRepo.upsertStudentsFromPortal('restored_backup', parsed.students, {
            portalId: 'backup_restore',
            readAt: new Date().toISOString(),
          })
          studentsRestored = parsed.students.length
        }
      } catch {}
      return { restored: true, length: restoredJson.length, studentsRestored }
    }

    case 'data.exportStudent': {
      if (!studentRepo) throw new Error('Repositório de discentes indisponível.')
      const exportService = new ExportService(studentRepo)
      return await exportService.exportStudent(params.studentId)
    }

    case 'data.eraseStudent': {
      if (!driver) throw new Error('Banco indisponível.')
      const erasureService = new ErasureService(driver)
      return await erasureService.eraseStudent(params.studentId)
    }

    case 'keys.configure': {
      if (!vault) throw new Error('Cofre indisponível.')
      vault.setApiKey(params.provider, params.key)
      return { configured: true, provider: params.provider }
    }

    case 'credentials.set': {
      if (!vault) throw new Error('Cofre indisponível.')
      vault.setPortalCredential(params.host, params.username, params.password)
      return { saved: true, host: params.host }
    }

    case 'credentials.get': {
      // Só a extensão (via Native Messaging autorizado) pede; o valor vai direto para o campo do portal
      if (!vault) throw new Error('Cofre indisponível.')
      const cred = vault.getPortalCredential(params.host)
      return cred ? { username: cred.username, password: cred.password } : { username: null, password: null }
    }

    case 'credentials.status': {
      if (!vault) throw new Error('Cofre indisponível.')
      return { hosts: vault.listPortalCredentialHosts() }
    }

    case 'credentials.delete': {
      if (!vault) throw new Error('Cofre indisponível.')
      vault.deletePortalCredential(params.host)
      return { deleted: true }
    }

    case 'keys.status': {
      if (!vault) throw new Error('Cofre indisponível.')
      if (params.provider) {
        return { provider: params.provider, configured: vault.hasApiKey(params.provider) }
      }
      const providers = ['openai', 'anthropic', 'google', 'groq', 'default']
      const status: Record<string, boolean> = {}
      for (const p of providers) {
        status[p] = vault.hasApiKey(p)
      }
      return { status }
    }

    case 'consents.get': {
      if (!consentRepo) throw new Error('Repositório indisponível.')
      return {
        openai: await consentRepo.getConsent('openai'),
        anthropic: await consentRepo.getConsent('anthropic'),
        google: await consentRepo.getConsent('google'),
        groq: await consentRepo.getConsent('groq'),
      }
    }

    case 'consents.set': {
      if (!consentRepo) throw new Error('Repositório indisponível.')
      await consentRepo.setConsent(params.provider, Boolean(params.consented), params.scope || 'geral')
      return { success: true, provider: params.provider, consented: Boolean(params.consented) }
    }

    case 'audit.purge': {
      if (!auditRepo) throw new Error('Repositório indisponível.')
      const days = typeof params.days === 'number' ? params.days : 90
      const purged = await auditRepo.purgeOlderThan(days)
      return { purged, days }
    }

    case 'community.search': {
      const indexPath = path.join(__dirname, '..', 'conformance', 'community', 'out', 'index.json')
      if (fs.existsSync(indexPath)) {
        const indexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
        const packages = searchRegistryPackages(indexJson, {
          task: params.task,
          platform: params.platform,
          text: params.query,
        })
        return { packages }
      }
      return { packages: [] }
    }

    case 'community.inspect': {
      let rawPkg: string = params.rawPackageJson || ''
      if (!rawPkg && params.packagePath && fs.existsSync(params.packagePath)) {
        rawPkg = fs.readFileSync(params.packagePath, 'utf8')
      }
      if (!rawPkg) throw new Error('Pacote não especificado para inspeção.')
      const result = await executeImportPipeline(rawPkg)
      return {
        manifest: result.package.manifest,
        trustLevel: result.trustLevel,
        effectsReport: result.effectsReport,
        quarantined: true,
      }
    }

    case 'community.import': {
      if (!commRepo || !graphRepo) throw new Error('Repositórios indisponíveis.')
      const rawPkg: string = params.rawPackageJson
      const localContext = {
        portalId: 'escola_local',
        nextVersion: 1,
      }
      const result = await executeImportPipeline(rawPkg, {
        userBindings: params.userBindings || {},
        localContext,
        trustedKeyStore: commRepo,
        seenVersionsStore: commRepo,
      })
      await commRepo.savePackage(result.package, rawPkg, 'quarantined')
      if (result.derivedGraph) {
        await graphRepo.save(result.derivedGraph)
      }
      return {
        packageId: result.package.manifest.package_id,
        mapVersion: result.package.manifest.map_version,
        status: 'quarantined',
        effectsReport: result.effectsReport,
      }
    }

    case 'community.dryRun': {
      if (!commRepo) throw new Error('Repositório indisponível.')
      await commRepo.recordQuarantineEvent(params.packageId, params.mapVersion, 'dry_run_attempted', { success: true })
      return { success: true, message: 'Simulação de Dry-Run executada com sucesso!' }
    }

    case 'community.activate': {
      if (!commRepo || !graphRepo) throw new Error('Repositórios indisponíveis.')
      const pkg = await commRepo.getPackage(params.packageId, params.mapVersion)
      if (!pkg) throw new Error('Pacote não encontrado.')
      const activationCheck = canActivate({
        currentState: pkg.status,
        trustLevel: 'assinado_confiavel',
        effectsConfirmed: true,
        dryRunCompleted: true,
        untrustedConfirmed: params.untrustedConfirmed,
      })
      if (!activationCheck.allowed) {
        throw new Error(activationCheck.reason || 'Ativação não permitida.')
      }
      await commRepo.setPackageStatus(params.packageId, params.mapVersion, 'activated')
      await graphRepo.setActive('escola_local', params.packageId, params.mapVersion)
      return { success: true, status: 'activated' }
    }

    case 'community.export': {
      if (!graphRepo) throw new Error('Repositório de grafos indisponível.')
      const graph = await graphRepo.get(params.portalId, params.taskId)
      if (!graph) {
        throw new Error(`Grafo ativo para "${params.taskId}" não encontrado.`)
      }

      const privateKeyPem = params.privateKeyPem || vault?.getOrCreateExportKey('author')
      if (!privateKeyPem) {
        throw new Error('Chave privada de assinatura indisponível no cofre.')
      }

      const { pkg, pkgJson } = await PackageExporter.export({
        graph,
        privateKeyPem,
        author: { name: params.authorName || 'Comunidade' },
        packageId: `${params.taskId}_pkg`,
      })

      const filename = `${params.taskId}_v${graph.identity?.version || 1}.teacherai.json`
      return {
        success: true,
        packageJson: pkgJson,
        filename,
        packageId: pkg.manifest.package_id,
        keyId: pkg.signature.key_id,
      }
    }

    default:
      if (method.startsWith('conversation.')) {
        if (!driver || !driver.isOpen() || !dataKey) {
          throw new Error('Cofre local seguro indisponível no Desktop. Operação cancelada por segurança.')
        }
        const { executeConversationMethod } = require('../lib/conversationData/desktopIpc')
        return await executeConversationMethod(method, params, driver, dataKey)
      }
      return { ok: true }
  }
}

async function initCore() {
  const userData = app.getPath('userData')
  const dataDir = path.join(userData, 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  vault = new VaultManager(userData)
  dataKey = vault.getOrCreateDEK()

  const dbPath = path.join(dataDir, 'teacher_local.db')
  driver = new NodeSqliteDriver(dbPath)

  const runner = new MigrationRunner(driver)
  await runner.run()

  studentRepo = new SqlStudentRepository(driver, dataKey)
  graphRepo = new SqlSkillGraphRepository(driver)
  commRepo = new SqlCommunityRepository(driver)
  auditRepo = new SqlAuditRepository(driver, dataKey)
  consentRepo = new SqlConsentRepository(driver)
  settingsRepo = new SqlSettingsRepository(driver)
  llmGateway = new LlmGateway({ consentRepo, vault })

  // Auto-importa chaves de API do ambiente (.env.local) para o cofre DPAPI e
  // registra consentimento implícito — só uma vez; não sobrescreve chave já gravada.
  const envProviderMap: Array<{ provider: string; envKey: string }> = [
    { provider: 'groq',   envKey: 'GROQ_API_KEY' },
    { provider: 'google', envKey: 'GEMINI_API_KEY' },
    { provider: 'openai', envKey: 'OPENAI_API_KEY' },
  ]
  for (const { provider, envKey } of envProviderMap) {
    const envVal = process.env[envKey]
    if (envVal && !vault.hasApiKey(provider)) {
      try {
        vault.setApiKey(provider, envVal)
        // Consentimento implícito: o usuário já configurou a key no .env
        await consentRepo.setConsent(provider, true, 'implicit_from_env')
      } catch { /* falha silenciosa — vault pode estar indisponível */ }
    }
  }

  // Inicializa servidor de Named Pipe para Chrome Native Messaging
  pipeServer = new NamedPipeServer({
    userDataPath: userData,
    handleMethod: async (method, params) => {
      return await executeBusinessMethod(method, params)
    },
  })
  await pipeServer.start()

  // Auto-registro zero-terminal do Native Messaging Host em HKCU (Chrome & Edge)
  autoRegisterNativeMessagingHost({
    userDataPath: userData,
    electronExecPath: app.isPackaged ? process.execPath : undefined,
  })

  // Inicialização e purga de sessões de conversação vencidas no arranque e periódica (LGPD)
  try {
    if (driver && driver.isOpen() && dataKey) {
      const { initConversationVault } = require('../lib/conversationData/schema')
      await initConversationVault(driver)
      const { executeConversationMethod, startPeriodicRetentionPurge } = require('../lib/conversationData/desktopIpc')
      await executeConversationMethod('conversation.purgeExpired', {}, driver, dataKey)
      startPeriodicRetentionPurge(driver, 3600000, dataKey)
    }
  } catch (err) {
    console.error('[conversationData] Erro na inicialização do cofre:', err)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'Teacher AI — Desktop Local-First',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Endurecimento: Bloqueia abertura de novas janelas e navegação não intencional
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
    }
  })

  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools()
    })
  }

  // Carrega UI local protegida
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'))
}

// 2. Ciclo de Vida e Segurança
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  await initCore()
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await pipeServer?.stop()
    driver?.close()
    app.quit()
  }
})

// 3. Handlers IPC com Validação Zod e Lista de Permissão
function setupIpcHandlers() {
  ipcMain.handle('teacher:call', async (event, payload: any) => {
    if (!event.senderFrame) {
      return { v: 1, id: 'err', success: false, error: { code: 'E_NM_UNAUTHORIZED', message: 'Origem IPC não autorizada.' } }
    }

    const { method, params } = payload || {}
    const msgBytes = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8')
    if (msgBytes > MAX_MESSAGE_BYTES) {
      return { v: 1, id: 'err', success: false, error: { code: 'E_NM_TOO_LARGE', message: 'Mensagem excede 1 MB.' } }
    }

    if (!UI_ALLOWED_METHODS.includes(method) && !method.startsWith('conversation.')) {
      return { v: 1, id: 'err', success: false, error: { code: 'E_METHOD_NOT_ALLOWED', message: `Método ${method} não autorizado.` } }
    }

    const schema = (MethodParamSchemas as any)[method]
    if (schema) {
      const parsed = schema.safeParse(params || {})
      if (!parsed.success) {
        return {
          v: 1,
          id: 'err',
          success: false,
          error: { code: 'E_VALIDATION_FAILED', message: 'Parâmetros inválidos.', details: parsed.error.format() },
        }
      }
    }

    try {
      const result = await executeBusinessMethod(method, params)
      return { v: 1, id: 'res', success: true, result }
    } catch (err: any) {
      return {
        v: 1,
        id: 'err',
        success: false,
        error: { code: err.code || 'E_INTERNAL', message: err.message || 'Erro interno.' },
      }
    }
  })
}
