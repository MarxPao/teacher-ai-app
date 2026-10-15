import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const PIPE_NAME = '\\\\.\\pipe\\teacher_ai_desktop_pipe'

function getNoncePath(): string {
  const appData = process.env.APPDATA || '.'
  const candidate1 = path.join(appData, 'TeacherAI', 'vault', 'session_nonce')
  if (fs.existsSync(candidate1)) return candidate1
  const candidate2 = path.join(appData, 'teacher-ai', 'vault', 'session_nonce')
  if (fs.existsSync(candidate2)) return candidate2
  return candidate1
}

function writeChromeResponse(obj: any, cb?: () => void): void {
  const jsonStr = JSON.stringify(obj)
  const payload = Buffer.from(jsonStr, 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(payload.length, 0)
  process.stdout.write(Buffer.concat([header, payload]), cb)
}

function getProjectRoot(): string {
  const oneUp = path.resolve(__dirname, '..')
  if (fs.existsSync(path.join(oneUp, 'dist-desktop', 'main.js')) || fs.existsSync(path.join(oneUp, 'package.json'))) {
    return oneUp
  }
  const twoUp = path.resolve(__dirname, '..', '..')
  if (fs.existsSync(path.join(twoUp, 'dist-desktop', 'main.js')) || fs.existsSync(path.join(twoUp, 'package.json'))) {
    return twoUp
  }
  return oneUp
}

async function tryConnectPipe(retries = 15, delayMs = 400): Promise<net.Socket> {
  for (let i = 0; i < retries; i++) {
    const socket = await new Promise<net.Socket | null>((resolve) => {
      const s = net.connect(PIPE_NAME)
      s.on('connect', () => resolve(s))
      s.on('error', () => {
        s.destroy()
        resolve(null)
      })
    })

    if (socket) return socket

    if (i === 0) {
      // Tenta iniciar o desktop em segundo plano
      tryAutoStartApp()
    }

    await new Promise((r) => setTimeout(r, delayMs))
  }

  throw new Error('E_APP_NOT_RUNNING')
}

function tryAutoStartApp(): void {
  try {
    const rootDir = getProjectRoot()
    const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
    const electronCmd = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
    const electronBin = fs.existsSync(electronExe) ? electronExe : electronCmd
    const mainJs = path.join(rootDir, 'dist-desktop', 'main.js')

    if (fs.existsSync(electronBin) && fs.existsSync(mainJs)) {
      const isCmd = electronBin.endsWith('.cmd') || electronBin.endsWith('.bat')
      const child = spawn(electronBin, [mainJs], {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: isCmd,
      })
      child.unref()
    }
  } catch {}
}

async function main() {
  let socket: net.Socket

  try {
    socket = await tryConnectPipe()
  } catch {
    writeChromeResponse(
      {
        v: 1,
        id: 'init_err',
        success: false,
        error: {
          code: 'E_APP_NOT_RUNNING',
          message: 'O aplicativo Teacher AI Desktop não está em execução e não pôde ser iniciado automaticamente.',
        },
      },
      () => {
        setTimeout(() => process.exit(0), 100)
      }
    )
    return
  }

  // Realiza handshake com nonce
  const noncePath = getNoncePath()
  let nonce = ''
  try {
    if (fs.existsSync(noncePath)) {
      nonce = fs.readFileSync(noncePath, 'utf8').trim()
    }
  } catch {}

  const handshakeMsg = Buffer.from(JSON.stringify({ type: 'HANDSHAKE', nonce }), 'utf8')
  const hsHeader = Buffer.alloc(4)
  hsHeader.writeUInt32LE(handshakeMsg.length, 0)
  socket.write(Buffer.concat([hsHeader, handshakeMsg]))

  // Pipe -> stdout (Chrome)
  let pipeBuffer = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    pipeBuffer = Buffer.concat([pipeBuffer, chunk])
    while (pipeBuffer.length >= 4) {
      const len = pipeBuffer.readUInt32LE(0)
      if (pipeBuffer.length < 4 + len) break

      const fullMessage = pipeBuffer.subarray(0, 4 + len)
      pipeBuffer = pipeBuffer.subarray(4 + len)
      process.stdout.write(fullMessage)
    }
  })

  socket.on('close', () => {
    process.exit(0)
  })

  socket.on('error', () => {
    process.exit(1)
  })

  // stdin (Chrome) -> Pipe
  let stdinBuffer = Buffer.alloc(0)
  process.stdin.on('data', (chunk) => {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk])
    while (stdinBuffer.length >= 4) {
      const len = stdinBuffer.readUInt32LE(0)
      if (stdinBuffer.length < 4 + len) break

      const fullMessage = stdinBuffer.subarray(0, 4 + len)
      stdinBuffer = stdinBuffer.subarray(4 + len)
      socket.write(fullMessage)
    }
  })
}

main().catch(() => process.exit(1))
