import { TEST_ONLY_KEYS } from '../../../../conformance/community/testKeys'

export interface PinnedRegistryKey {
  key_id: string
  public_key: string
  label?: string
}

/**
 * Chave mestra do registro comunitário fixada por padrão no aplicativo.
 * Em desenvolvimento/testes utiliza a chave determinística TEST_ONLY_KEYS.registryMasterKey.
 */
export const DEFAULT_PINNED_REGISTRY_KEY: PinnedRegistryKey = {
  key_id: TEST_ONLY_KEYS.registryMasterKey.keyId,
  public_key: TEST_ONLY_KEYS.registryMasterKey.publicKeyHex,
  label: 'Registro Oficial Comunitário Teacher AI',
}
