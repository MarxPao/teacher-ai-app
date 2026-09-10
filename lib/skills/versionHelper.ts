/**
 * Helper canônico para normalização de versões de Skills de Portais.
 * Padroniza qualquer representação (inteiro, string, semver parcial)
 * para o formato canônico semver 'X.Y.Z' (ex: 1 -> '1.0.0').
 */
export function normalizeSkillVersion(rawVersion: any): string {
  if (rawVersion === null || rawVersion === undefined || rawVersion === '') {
    return '1.0.0'
  }

  const str = String(rawVersion).trim().replace(/^v/i, '')

  // Se for apenas dígitos inteiros (ex: 1, 2, "1", "2")
  if (/^\d+$/.test(str)) {
    return `${str}.0.0`
  }

  // Se for semver incompleto (ex: "1.0", "2.1")
  if (/^\d+\.\d+$/.test(str)) {
    return `${str}.0`
  }

  // Se já for semver completo (ex: "1.0.0", "1.0.0-beta")
  if (/^\d+\.\d+\.\d+/.test(str)) {
    return str
  }

  return '1.0.0'
}
