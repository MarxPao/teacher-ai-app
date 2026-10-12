import { CommunityError } from '../errors'

export interface SeenVersionsStore {
  getMaxSeenVersion(publisherKeyId: string, packageId: string): Promise<number | null>
  recordSeenVersion(publisherKeyId: string, packageId: string, version: number): Promise<void>
}

export async function checkRollback(
  publisherKeyId: string,
  packageId: string,
  mapVersion: number,
  store: SeenVersionsStore,
  allowRollbackConfirmed: boolean = false
): Promise<void> {
  const maxSeen = await store.getMaxSeenVersion(publisherKeyId, packageId)
  if (maxSeen !== null && mapVersion < maxSeen) {
    if (!allowRollbackConfirmed) {
      throw new CommunityError(
        'E_PKG_ROLLBACK',
        `Tentativa de importar versão ${mapVersion}, mas a versão ${maxSeen} já foi vista para este pacote. Downgrade rejeitado sem confirmação explícita.`
      )
    }
  }
}
