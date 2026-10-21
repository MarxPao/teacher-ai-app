import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

export const NATIVE_HOST_NAME = 'com.teacherai.desktop'
export const DEFAULT_EXTENSION_ID = 'phahliidgjidilhkcllbhfjmjcefdfci'
export const REGISTRY_KEY_CHROME = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`
export const REGISTRY_KEY_EDGE = `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`

export interface AutoRegisterOptions {
  userDataPath: string
  shimExecutablePath?: string
  shimJsPath?: string
  electronExecPath?: string
  extensionIds?: string[]
  platform?: NodeJS.Platform
  execCommand?: (cmd: string) => void
  writeFile?: (filePath: string, content: string) => void
  mkdir?: (dirPath: string) => void
}

export interface AutoRegisterResult {
  registered: boolean
  manifestPath: string
  shimPath: string
  manifest: {
    name: string
    description: string
    path: string
    type: 'stdio'
    allowed_origins: string[]
  }
  registryKeys: string[]
}

/**
 * Registra automaticamente o Native Messaging Host (`com.teacherai.desktop`) no boot do App Desktop
 * em HKCU, garantindo que o script executável do shim exista fisicamente no disco antes de apontar o registro.
 */
export function autoRegisterNativeMessagingHost(options: AutoRegisterOptions): AutoRegisterResult {
  const platform = options.platform || process.platform
  const hostDir = path.join(options.userDataPath, 'native-host')
  const manifestPath = path.join(hostDir, `${NATIVE_HOST_NAME}.json`)

  // Localiza shim.js real empacotado junto ao main.js (dist-desktop/shim.js)
  const resolvedShimJs =
    options.shimJsPath ||
    path.resolve(__dirname, 'shim.js')

  const defaultShimPath =
    platform === 'win32'
      ? path.join(hostDir, 'teacherai-nm-shim.cmd')
      : path.join(hostDir, 'teacherai-nm-shim.sh')

  const shimPath = options.shimExecutablePath || defaultShimPath
  const extIds =
    options.extensionIds && options.extensionIds.length > 0
      ? options.extensionIds
      : [process.env.TEACHER_AI_EXTENSION_ID || DEFAULT_EXTENSION_ID]

  const allowedOrigins = extIds.map(id =>
    id.startsWith('chrome-extension://') ? id : `chrome-extension://${id.replace(/\/$/, '')}/`
  )

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Teacher AI Local-First Native Messaging Host',
    path: shimPath,
    type: 'stdio' as const,
    allowed_origins: allowedOrigins,
  }

  const mkdirFn = options.mkdir || ((d: string) => fs.mkdirSync(d, { recursive: true }))
  const writeFn = options.writeFile || ((f: string, c: string) => fs.writeFileSync(f, c, 'utf8'))
  const execFn = options.execCommand || ((cmd: string) => execSync(cmd, { stdio: 'ignore', windowsHide: true }))

  const registryKeys: string[] = []
  let registered = false

  try {
    mkdirFn(hostDir)

    // Gera fisicamente o wrapper executável (.cmd / .sh) se não foi passado um shim externo já existente
    if (!options.shimExecutablePath) {
      const electronBin = options.electronExecPath
      if (platform === 'win32') {
        const cmdContent = electronBin
          ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronBin}" "${resolvedShimJs}" %*\r\n`
          : `@echo off\r\nnode "${resolvedShimJs}" %*\r\n`
        writeFn(shimPath, cmdContent)
      } else {
        const shContent = electronBin
          ? `#!/usr/bin/env sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${electronBin}" "${resolvedShimJs}" "$@"\n`
          : `#!/usr/bin/env sh\nexec node "${resolvedShimJs}" "$@"\n`
        writeFn(shimPath, shContent)
      }
    }

    writeFn(manifestPath, JSON.stringify(manifest, null, 2))

    if (platform === 'win32') {
      for (const regKey of [REGISTRY_KEY_CHROME, REGISTRY_KEY_EDGE]) {
        const cmd = `reg add "${regKey}" /ve /t REG_SZ /d "${manifestPath}" /f`
        execFn(cmd)
        registryKeys.push(regKey)
      }
    }
    registered = true
  } catch {
    registered = false
  }

  return {
    registered,
    manifestPath,
    shimPath,
    manifest,
    registryKeys,
  }
}
