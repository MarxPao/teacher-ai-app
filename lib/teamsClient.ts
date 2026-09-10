/**
 * lib/teamsClient.ts — Microsoft Teams Client (Graph API / OAuth2 BYOK)
 *
 * Suporte a Microsoft Teams para envio de comunicados e leitura de canais.
 * Utiliza o endpoint canônico da Microsoft Graph API v1.0.
 *
 * Tratamento explícito de bloqueio / ausência de credenciais organizacionais (Azure AD / Entra ID).
 */

export interface TeamsOAuthConfig {
  clientId?: string
  tenantId?: string
  clientSecret?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

export interface TeamsMessagePayload {
  teamId?: string
  channelId?: string
  chatId?: string
  content: string
  contentType?: 'text' | 'html'
}

export interface TeamsTeamItem {
  id: string
  displayName: string
  description?: string
}

export interface TeamsChannelItem {
  id: string
  displayName: string
  description?: string
  email?: string
}

export interface TeamsMessageResult {
  id: string
  createdDateTime: string
  webUrl?: string
  content: string
}

export interface AzureAdBlockedError {
  type: 'AZURE_AD_CREDENTIALS_REQUIRED'
  message: string
  required_scopes: string[]
  admin_guide: string
  details?: unknown
}

export const TEAMS_REQUIRED_SCOPES = [
  'ChannelMessage.Send',
  'Chat.ReadWrite',
  'Team.ReadBasic.All',
  'User.Read'
]

export const TEAMS_ADMIN_GUIDE = `
### Guia de Configuração Microsoft Teams para a Equipe de TI da Escola

Para permitir que os professores utilizem o assistente Teacher AI integrado ao Microsoft Teams da instituição:

1. **Acessar o Microsoft Entra admin center (antigo Azure Portal)**:
   - URL: https://entra.microsoft.com ou https://portal.azure.com
2. **Registrar Novo Aplicativo**:
   - Navegar até: "Identidade" > "Aplicativos" > "Registros de aplicativo" > "Novo registro".
   - Nome: "Teacher AI - Assistente Pedagógico".
   - Tipos de conta com suporte: "Contas neste diretório organizacional apenas" (Single-tenant) ou "Multilocatário".
   - URI de Redirecionamento (Plataforma Web): "http://localhost:3000/api/auth/teams/callback" (ou domínio oficial da aplicação).
3. **Configurar Permissões de API (Microsoft Graph)**:
   - Em "Permissões de API" > "Adicionar uma permissão" > "Microsoft Graph" > "Permissões delegadas":
     - \`ChannelMessage.Send\` (Permite enviar comunicados pedagógicos em canais)
     - \`Chat.ReadWrite\` (Permite envio de mensagens diretas e chats)
     - \`Team.ReadBasic.All\` (Permite listar equipes e turmas do docente)
     - \`User.Read\` (Identificação do professor autenticado)
   - Clicar em **"Conceder consentimento do administrador para [Nome da Instituição]"** (Admin Consent obrigatório em tenants educacionais).
4. **Coleta de Identificadores**:
   - Copiar o **ID do Aplicativo (cliente)** (Client ID).
   - Copiar o **ID do Diretório (locatário)** (Tenant ID).
   - Fornecer estes valores ao docente para inserção no painel Teacher AI.
`

const STORAGE_KEY = 'teacher_ai_teams_config'

export function getTeamsConfig(): TeamsOAuthConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TeamsOAuthConfig
  } catch {
    return null
  }
}

export function saveTeamsConfig(config: TeamsOAuthConfig): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (err) {
    console.error('[TeamsClient] Erro ao salvar configurações do Teams:', err)
  }
}

export function isTeamsConnected(): boolean {
  const cfg = getTeamsConfig()
  if (!cfg) return false
  if (cfg.accessToken && (!cfg.expiresAt || cfg.expiresAt > Date.now())) return true
  if (cfg.clientId && cfg.tenantId) return true
  return false
}

export function validateTeamsCredentials(config?: TeamsOAuthConfig | null): AzureAdBlockedError | null {
  const activeCfg = config || getTeamsConfig()
  
  if (!activeCfg || (!activeCfg.accessToken && (!activeCfg.clientId || !activeCfg.tenantId))) {
    return {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      message: 'Credenciais do Microsoft Azure AD / Entra ID não configuradas. É necessário cadastrar o aplicativo no tenant institucional da escola.',
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE
    }
  }

  if (activeCfg.expiresAt && activeCfg.expiresAt <= Date.now() && !activeCfg.refreshToken) {
    return {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      message: 'Sessão OAuth2 expirada. Reautenticação necessária com o tenant Microsoft 365 da instituição.',
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE
    }
  }

  return null
}

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

export async function listJoinedTeams(token: string): Promise<TeamsTeamItem[]> {
  const res = await fetch(`${GRAPH_BASE_URL}/me/joinedTeams`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      status: res.status,
      message: `Erro na API Microsoft Graph (${res.status}): ${errorBody?.error?.message || 'Acesso negado pelo Azure AD'}`,
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE,
      details: errorBody
    }
  }

  const data = await res.json()
  return (data.value || []).map((t: any) => ({
    id: t.id,
    displayName: t.displayName,
    description: t.description || ''
  }))
}

export async function listChannels(teamId: string, token: string): Promise<TeamsChannelItem[]> {
  const res = await fetch(`${GRAPH_BASE_URL}/teams/${teamId}/channels`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      status: res.status,
      message: `Erro na API Microsoft Graph (${res.status}): ${errorBody?.error?.message || 'Falha ao listar canais'}`,
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE,
      details: errorBody
    }
  }

  const data = await res.json()
  return (data.value || []).map((c: any) => ({
    id: c.id,
    displayName: c.displayName,
    description: c.description || '',
    email: c.email
  }))
}

export async function postChannelMessage(
  teamId: string,
  channelId: string,
  content: string,
  token: string,
  contentType: 'text' | 'html' = 'html'
): Promise<TeamsMessageResult> {
  const res = await fetch(`${GRAPH_BASE_URL}/teams/${teamId}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body: {
        contentType,
        content
      }
    })
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      status: res.status,
      message: `Erro ao postar mensagem no canal Teams (${res.status}): ${errorBody?.error?.message || 'Não autorizado ou escopo insuficiente'}`,
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE,
      details: errorBody
    }
  }

  const data = await res.json()
  return {
    id: data.id,
    createdDateTime: data.createdDateTime,
    webUrl: data.webUrl,
    content: data.body?.content || content
  }
}

export async function postChatMessage(
  chatId: string,
  content: string,
  token: string,
  contentType: 'text' | 'html' = 'html'
): Promise<TeamsMessageResult> {
  const res = await fetch(`${GRAPH_BASE_URL}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body: {
        contentType,
        content
      }
    })
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw {
      type: 'AZURE_AD_CREDENTIALS_REQUIRED',
      status: res.status,
      message: `Erro ao postar no chat do Teams (${res.status}): ${errorBody?.error?.message || 'Não autorizado'}`,
      required_scopes: TEAMS_REQUIRED_SCOPES,
      admin_guide: TEAMS_ADMIN_GUIDE,
      details: errorBody
    }
  }

  const data = await res.json()
  return {
    id: data.id,
    createdDateTime: data.createdDateTime,
    webUrl: data.webUrl,
    content: data.body?.content || content
  }
}
