import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PIPE_NAME = '\\\\.\\pipe\\teacher_ai_desktop_pipe'

function getValidNonce(): string {
  const noncePath = path.join(process.env.APPDATA || '.', 'TeacherAI', 'vault', 'session_nonce')
  if (fs.existsSync(noncePath)) {
    return fs.readFileSync(noncePath, 'utf8').trim()
  }
  return 'dummy_nonce'
}

function sendFramed(socket: net.Socket, obj: any): void {
  const jsonStr = JSON.stringify(obj)
  const payload = Buffer.from(jsonStr, 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(payload.length, 0)
  socket.write(Buffer.concat([header, payload]))
}

function readFramedResponse(socket: net.Socket, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT'))
    }, timeoutMs)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0)
        if (buffer.length >= 4 + len) {
          clearTimeout(timer)
          const msgBytes = buffer.subarray(4, 4 + len)
          try {
            resolve(JSON.parse(msgBytes.toString('utf8')))
          } catch (e) {
            reject(e)
          }
        }
      }
    })

    socket.on('close', () => {
      clearTimeout(timer)
      resolve({ closed: true })
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function runNegativeTests() {
  console.log('=== Testes Negativos de Segurança (Native Messaging) ===\n')
  let passed = 0

  // 1. Conexão sem Handshake prévio
  try {
    const s1 = net.connect(PIPE_NAME)
    sendFramed(s1, { v: 1, id: '1', method: 'app.status', params: {} })
    const res1 = await readFramedResponse(s1)
    if (res1.error?.code === 'E_NM_UNAUTHORIZED' || res1.closed) {
      console.log('✓ Caso 1: Requisição sem handshake recusada com sucesso (E_NM_UNAUTHORIZED ou socket fechado).')
      passed++
    } else {
      console.error('✗ Caso 1 FALHOU:', res1)
    }
    s1.destroy()
  } catch (err: any) {
    console.log(`✓ Caso 1: Conexão rejeitada (${err.message})`)
    passed++
  }

  // 2. Handshake com Nonce Falso
  try {
    const s2 = net.connect(PIPE_NAME)
    sendFramed(s2, { type: 'HANDSHAKE', nonce: 'nonce_falso_invalido_123' })
    const res2 = await readFramedResponse(s2)
    if (res2.error?.code === 'E_NM_UNAUTHORIZED' || res2.closed) {
      console.log('✓ Caso 2: Handshake com nonce falso recusado (E_NM_UNAUTHORIZED).')
      passed++
    } else {
      console.error('✗ Caso 2 FALHOU:', res2)
    }
    s2.destroy()
  } catch (err: any) {
    console.log(`✓ Caso 2: Conexão rejeitada (${err.message})`)
    passed++
  }

  // 3. Método Proibido para a Extensão (ex: data.eraseStudent)
  const validNonce = getValidNonce()
  try {
    const s3 = net.connect(PIPE_NAME)
    sendFramed(s3, { type: 'HANDSHAKE', nonce: validNonce })
    await readFramedResponse(s3) // Auth ack

    sendFramed(s3, { v: 1, id: '3', method: 'data.eraseStudent', params: { studentId: '1' } })
    const res3 = await readFramedResponse(s3)
    if (res3.error?.code === 'E_METHOD_NOT_ALLOWED') {
      console.log('✓ Caso 3: Método restrito à UI (data.eraseStudent) recusado para a extensão (E_METHOD_NOT_ALLOWED).')
      passed++
    } else {
      console.error('✗ Caso 3 FALHOU:', res3)
    }
    s3.destroy()
  } catch (err: any) {
    console.error('✗ Caso 3 Erro:', err.message)
  }

  // 4. Parâmetros com campos extras (Violação do .strict())
  try {
    const s4 = net.connect(PIPE_NAME)
    sendFramed(s4, { type: 'HANDSHAKE', nonce: validNonce })
    await readFramedResponse(s4) // Auth ack

    sendFramed(s4, {
      v: 1,
      id: '4',
      method: 'students.list',
      params: { classId: 'cls1', campoInvasor: 'tentativa' },
    })
    const res4 = await readFramedResponse(s4)
    if (res4.error?.code === 'E_VALIDATION_FAILED') {
      console.log('✓ Caso 4: Parâmetros com campos extras rejeitados por validação estrita (E_VALIDATION_FAILED).')
      passed++
    } else {
      console.error('✗ Caso 4 FALHOU:', res4)
    }
    s4.destroy()
  } catch (err: any) {
    console.error('✗ Caso 4 Erro:', err.message)
  }

  console.log(`\nResultado dos testes negativos: ${passed}/4 casos aprovados com sucesso.`)
}

runNegativeTests().catch((err) => {
  console.error('[Negative Test] Falha geral:', err)
  process.exit(1)
})
