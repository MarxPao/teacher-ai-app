/**
 * SqlDriver — Interface abstrata e desacoplada para execução SQL.
 * Permite alternar entre SQLite nativo (node:sqlite / electron) e mock em memória para testes.
 */
export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<void>
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>
  isOpen?(): boolean
  close?(): void
}
