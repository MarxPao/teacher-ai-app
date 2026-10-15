import { z } from 'zod'

export const MAX_MESSAGE_BYTES = 1024 * 1024 // 1 MB

/**
 * Métodos autorizados para invocação pela extensão Chrome via Native Messaging.
 */
export const EXTENSION_ALLOWED_METHODS = [
  'app.status',
  'students.list',
  'students.upsertRoster',
  'students.upsertFromPortal',
  'graphs.get',
  'graphs.resolveActive',
  'graphs.listActive',
  'graphs.save',
  'audit.append',
  'nlu.parse',
] as const

export type ExtensionMethod = typeof EXTENSION_ALLOWED_METHODS[number]

/**
 * Métodos autorizados para a UI do aplicativo Desktop (Renderer via IPC).
 */
export const UI_ALLOWED_METHODS = [
  ...EXTENSION_ALLOWED_METHODS,
  'community.export',
  'data.exportStudent',
  'data.eraseStudent',
  'data.backup',
  'data.restore',
  'keys.configure',
  'consents.get',
  'consents.set',
  'audit.purge',
  'community.search',
  'community.inspect',
  'community.import',
  'community.activate',
  'community.dryRun',
] as const

export type UiMethod = typeof UI_ALLOWED_METHODS[number]

// ─── Envelopes Base do Protocolo ──────────────────────────────────────────────

export const ProtocolRequestSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type ProtocolRequest = z.infer<typeof ProtocolRequestSchema>

export const ProtocolErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
}).strict()

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>

export const ProtocolResponseSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: ProtocolErrorSchema.optional(),
}).strict()

export type ProtocolResponse = z.infer<typeof ProtocolResponseSchema>

// ─── Schemas Específicos por Método (Strict) ─────────────────────────────────

export const MethodParamSchemas = {
  'app.status': z.object({}).strict(),
  
  'students.list': z.object({
    classId: z.string().optional(),
  }).strict(),

  'students.upsertRoster': z.object({
    classId: z.string().min(1),
    students: z.array(z.record(z.string(), z.unknown())),
    source: z.object({
      portalId: z.string().min(1),
      readAt: z.string().min(1),
    }).strict(),
  }).strict(),

  'students.upsertFromPortal': z.object({
    classId: z.string().min(1),
    students: z.array(z.record(z.string(), z.unknown())),
    source: z.object({
      portalId: z.string().min(1),
      readAt: z.string().min(1),
    }).strict(),
  }).strict(),

  'graphs.get': z.object({
    portalId: z.string().min(1),
    taskId: z.string().min(1),
    version: z.number().int().min(1).optional(),
  }).strict(),

  'graphs.resolveActive': z.object({
    host: z.string().min(1),
    taskId: z.string().min(1),
  }).strict(),

  'graphs.listActive': z.object({
    host: z.string().min(1),
  }).strict(),

  'graphs.save': z.object({
    graph: z.record(z.string(), z.unknown()),
    activate: z.boolean().optional(),
  }).strict(),

  'audit.append': z.object({
    entry: z.record(z.string(), z.unknown()),
  }).strict(),

  'nlu.parse': z.object({
    text: z.string().min(1),
    catalog: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  }).strict(),

  'data.exportStudent': z.object({
    studentId: z.string().min(1),
  }).strict(),

  'data.eraseStudent': z.object({
    studentId: z.string().min(1),
  }).strict(),

  'data.backup': z.object({
    passphrase: z.string().min(6),
  }).strict(),

  'data.restore': z.object({
    passphrase: z.string().min(6),
    backupBase64: z.string().min(1),
  }).strict(),

  'keys.configure': z.object({
    provider: z.string().min(1),
    key: z.string().min(1),
  }).strict(),

  'keys.status': z.object({
    provider: z.string().optional(),
  }).strict(),

  'consents.get': z.object({}).strict(),

  'consents.set': z.object({
    provider: z.string().min(1),
    consented: z.boolean(),
    scope: z.string().optional(),
  }).strict(),

  'audit.purge': z.object({
    days: z.number().int().min(1).optional(),
  }).strict(),

  'community.search': z.object({
    query: z.string().optional(),
    platform: z.string().optional(),
    task: z.string().optional(),
  }).strict(),

  'community.inspect': z.object({
    packagePath: z.string().optional(),
    rawPackageJson: z.string().optional(),
  }).strict(),

  'community.import': z.object({
    rawPackageJson: z.string().min(1),
    userBindings: z.record(z.string(), z.string()).optional(),
  }).strict(),

  'community.activate': z.object({
    packageId: z.string().min(1),
    mapVersion: z.number().int().min(1),
    untrustedConfirmed: z.boolean().optional(),
  }).strict(),

  'community.dryRun': z.object({
    packageId: z.string().min(1),
    mapVersion: z.number().int().min(1),
  }).strict(),

  'community.export': z.object({
    portalId: z.string().min(1),
    taskId: z.string().min(1),
    privateKeyPem: z.string().optional(),
    authorName: z.string().optional(),
  }).strict(),
} as const
