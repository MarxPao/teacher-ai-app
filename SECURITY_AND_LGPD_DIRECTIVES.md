# PROMPT MESTRE DE SEGURANÇA & CONFORMIDADE LGPD — VIBE CODING BLINDADO

Este documento estabelece as diretrizes obrigatórias de segurança de software, privacidade e conformidade com a LGPD (Lei Geral de Proteção de Dados - Brasil) para todo o código-fonte gerado, editado ou auditado no projeto **Teacher AI**.

---

## 1. AUTENTICAÇÃO E AUTORIZAÇÃO
- **Servidor como Fonte de Verdade**: Nunca confiar em validações feitas apenas no frontend. Toda regra de permissão deve ser reforçada no backend/API (Supabase RLS, API Middleware).
- **Provedores Homologados**: Usar Supabase Auth / OAuth / bibliotecas mantidas em vez de código proprietário do zero.
- **Verificação de Propriedade do Recurso**: O usuário só pode ler/editar/excluir dados pertencentes ao seu ID de sessão verificado no backend (`auth.uid()`), nunca por IDs manipuláveis vindos no body da requisição.
- **Gestão de Sessão**: Tokens com expiração curta e refresh tokens invalidáveis.
- **Mensagens Genéricas de Erro**: Evitar enumeração de usuários (utilizar mensagens genéricas como "E-mail ou senha incorretos").

---

## 2. DADOS SENSÍVEIS E SEGREDOS
- **Hashing de Senhas**: bcrypt, argon2 ou scrypt (mínimo cost factor 12 para bcrypt). Nunca MD5, SHA1 puro ou texto plano.
- **Segredos Fora do Código**: Nenhuma API Key, JWT secret ou connection string hardcoded no código. Variáveis de ambiente `.env.local` registradas no `.gitignore`.
- **Secrets Manager em Produção**: Gerenciador seguro em produção (Vercel / Supabase Secrets).
- **Proteção em Repouso**: Dados sensíveis (CPF, RG, dados de saúde, financeiros, biometria) criptografados em repouso.
- **Sem Dados Pessoais em Logs**: Proibido `console.log` de payloads sensíveis em produção ou serviços de monitoramento.

---

## 3. BANCO DE DADOS
- **Queries Parametrizadas**: Sempre utilizar ORM/Query Builder (Supabase client, Prisma, Drizzle). Jamais concatenar strings SQL dinâmicas com inputs de usuários.
- **Row Level Security (RLS)**: Habilitar RLS em 100% das tabelas PostgreSQL do Supabase e definir políticas estritas por `auth.uid()`.
- **Migrations Versionadas**: Migrações automatizadas e versionadas; edições manuais em produção são proibidas.

---

## 4. API, REDE E INPUT
- **Sanitização no Backend**: Validar e sanitizar todo input no backend via bibliotecas de schema (`zod`).
- **Rate Limiting**: Rate limit ativo em rotas públicas e sensíveis (`/api/agent`, `/api/tts`, `/api/transcribe`, login).
- **CORS Restrito**: Domínios específicos declarados — proibidão `Access-Control-Allow-Origin: *` em produção.
- **HTTPS Obrigatório**: Tráfego 100% cifrado por TLS/SSL.
- **Sanitização contra XSS**: Escape obrigatório em renderizações HTML/JSX.

---

## 5. FRONTEND
- **Armazenamento Seguro**: Preferir cookies `httpOnly`, `secure`, `sameSite`. Evitar localStorage para tokens de longo prazo.
- **Segurança Não Visual**: Esconder elementos de UI não substitui autorização real no backend.
- **Chaves Públicas vs Privadas**: Apenas a `anon_key` pública deve estar acessível no cliente. `service_role_key` deve permanecer estritamente no backend.

---

## 6. LGPD — REQUISITOS DE CONFORMIDADE
- **Minimização de Dados**: Coletar somente o estritamente necessário.
- **Base Legal**: Identificar explicitamente a base legal (consentimento, execução de contrato, legítimo interesse, obrigação legal).
- **Consentimento Explícito**: Opt-in explícito e auditável para qualquer uso secundário.
- **Direitos do Titular**:
  - **Exclusão de Conta & Dados**: Suporte nativo à eliminação efetiva de dados pessoais (ou anonimização).
  - **Portabilidade dos Dados**: Exportação em formato estruturado legível (`JSON` / `CSV`).
  - **Retificação**: Correção imediata de dados incorretos.
- **Retenção & Descarte**: Política clara de expiração e eliminação de dados obsoletos.
- **Envio de Dados para IAs de Terceiros**: Notificar expressamente no termo de privacidade o envio de trechos pedagógicos para provedores de LLM (OpenAI, Google Gemini, Anthropic), aplicando mascaramento de dados sensíveis antes do envio.

---

## 7. DEPENDÊNCIAS E INFRAESTRUTURA
- **Pacotes Auditados**: Manter dependências atualizadas e executar `npm audit` periodicamente.
- **Sem Desabilitação de TLS**: Jamais usar `NODE_TLS_REJECT_UNAUTHORIZED=0` fora do ambiente de desenvolvimento.

---

## 8. REGISTRO E TRANSPARÊNCIA NAS GERACÕES DE CÓDIGO
- Todo código que manipula autenticação, dados pessoais ou pagamentos conterá comentários explícitos sobre as decisões de segurança tomadas.
- Qualquer protótipo rápido para testes conterá o aviso claro: `// ⚠️ PROTOTYPE / TEST ONLY — NOT PRODUCTION READY`.
