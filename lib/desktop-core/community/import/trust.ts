export type TrustLevel =
  | 'invalido'
  | 'assinado_desconhecido'
  | 'assinado_confiavel'
  | 'revisado_no_registro'

export interface TrustedKeyStore {
  isTrusted(keyId: string): Promise<boolean>
}

export interface RegistryReviewStore {
  isReviewed(keyId: string, packageId: string, mapVersion: number): Promise<boolean>
}

export async function evaluateTrustLevel(
  publisherKeyId: string,
  packageId: string,
  mapVersion: number,
  trustedKeyStore?: TrustedKeyStore,
  registryReviewStore?: RegistryReviewStore
): Promise<TrustLevel> {
  if (!publisherKeyId || publisherKeyId === 'unsigned' || publisherKeyId === 'unknown') {
    return 'invalido'
  }

  // 1. Checa se consta como revisado no índice oficial do registro
  if (registryReviewStore) {
    const reviewed = await registryReviewStore.isReviewed(publisherKeyId, packageId, mapVersion)
    if (reviewed) {
      return 'revisado_no_registro'
    }
  }

  // 2. Checa se a usuária fixou confiança manualmente na chave
  if (trustedKeyStore) {
    const trusted = await trustedKeyStore.isTrusted(publisherKeyId)
    if (trusted) {
      return 'assinado_confiavel'
    }
  }

  // 3. Assinatura válida de chave ainda não fixada
  return 'assinado_desconhecido'
}
