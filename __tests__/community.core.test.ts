import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import {
  canonicalize,
  strictJsonParse,
  checkSafeString,
  traverseSafeText,
  checkSafeRegex,
  signPackagePayload,
  verifyPackageSignature,
  sanitizeGraphForExport,
  buildExportPackage,
  executeImportPipeline,
  assertAllowedDifferencesOnly,
  canActivate,
  CommunityError,
} from '../lib/desktop-core/community'
import { TEST_ONLY_KEYS } from '../conformance/community/testKeys'
// @ts-ignore
import { DatabaseSync } from 'node:sqlite'
import { MigrationRunner } from '../lib/desktop-core/db/migrations'
import { SqlCommunityRepository } from '../lib/desktop-core/community/repositories/SqlCommunityRepository'
import { SqlSkillGraphRepository } from '../lib/desktop-core/db/repositories/SqlSkillGraphRepository'

const BASE_DIR = path.resolve(__dirname, '..', 'conformance', 'community', 'base')
const OUT_DEV_DIR = path.resolve(__dirname, '..', 'conformance', 'community', 'out', 'dev')

function loadBaseGraph(filename: string): any {
  return JSON.parse(fs.readFileSync(path.join(BASE_DIR, filename), 'utf8'))
}

describe('Fase 7 - Núcleo Comunitário: Teste de Fronteira', () => {
  describe('1. Canonicalização RFC 8785 (JCS)', () => {
    it('ordena chaves lexicograficamente em objetos aninhados', () => {
      const obj1 = { z: 1, a: { y: 2, b: 3 }, m: 'teste' }
      const obj2 = { a: { b: 3, y: 2 }, m: 'teste', z: 1 }
      expect(canonicalize(obj1)).toBe('{"a":{"b":3,"y":2},"m":"teste","z":1}')
      expect(canonicalize(obj1)).toBe(canonicalize(obj2))
    })

    it('preserva arrays na ordem original e formata tipos primitivos', () => {
      const payload = { list: [3, 1, 2], bool: true, nil: null, num: 42 }
      expect(canonicalize(payload)).toBe('{"bool":true,"list":[3,1,2],"nil":null,"num":42}')
    })
  })

  describe('2. Parser JSON Estrito (Anti-Tampering)', () => {
    it('parseia JSON válido com sucesso', () => {
      const parsed = strictJsonParse('{"ok": true, "val": 123}')
      expect(parsed).toEqual({ ok: true, val: 123 })
    })

    it('rejeita chaves duplicadas no mesmo objeto com E_PKG_UNSAFE_JSON', () => {
      const hostileJson = '{"chave": 1, "chave": 2}'
      expect(() => strictJsonParse(hostileJson)).toThrow(CommunityError)
      try {
        strictJsonParse(hostileJson)
      } catch (err: any) {
        expect(err.code).toBe('E_PKG_UNSAFE_JSON')
      }
    })

    it('rejeita poluição de protótipo (__proto__, constructor, prototype)', () => {
      const protoJson = '{"__proto__": {"polluted": true}}'
      expect(() => strictJsonParse(protoJson)).toThrow(CommunityError)
      try {
        strictJsonParse(protoJson)
      } catch (err: any) {
        expect(err.code).toBe('E_PKG_UNSAFE_JSON')
      }
    })

    it('rejeita profundidade de aninhamento excessiva (> 32 níveis)', () => {
      let deepJson = '{"a": '
      for (let i = 0; i < 35; i++) deepJson += '{"n": '
      deepJson += '1'
      for (let i = 0; i < 35; i++) deepJson += '}'
      deepJson += '}'
      expect(() => strictJsonParse(deepJson)).toThrow(CommunityError)
      try {
        strictJsonParse(deepJson)
      } catch (err: any) {
        expect(err.code).toBe('E_PKG_UNSAFE_JSON')
      }
    })
  })

  describe('3. Assinatura e Verificação Ed25519', () => {
    it('assina e verifica pacote com sucesso com chave válida', () => {
      const graph = loadBaseGraph('base_read_roster.json')
      const manifest = {
        package_id: 'pacote-teste',
        map_version: 1,
        spec_version: '2.0' as const,
        publisher: {
          key_id: TEST_ONLY_KEYS.publisherA.keyId,
          handle: TEST_ONLY_KEYS.publisherA.handle,
        },
        license: 'CC-BY-4.0' as const,
        hosts: [{ placeholder: 'h1.invalid', role: 'portal' as const, suffix_hint: 'paineldoaluno.com.br' }],
        tasks: ['read_roster'],
        created_at: '2026-10-11T20:00:00Z',
      }

      const payload = { pkg_format: 'skillpkg/1' as const, manifest, content: graph }
      const signature = signPackagePayload(payload, TEST_ONLY_KEYS.publisherA.privateKey)

      const pkg = { ...payload, signature }
      expect(verifyPackageSignature(pkg)).toBe(true)
    })

    it('rejeita verificação se qualquer byte do conteúdo for adulterado', () => {
      const graph = loadBaseGraph('base_read_roster.json')
      const manifest = {
        package_id: 'pacote-teste',
        map_version: 1,
        spec_version: '2.0' as const,
        publisher: {
          key_id: TEST_ONLY_KEYS.publisherA.keyId,
          handle: TEST_ONLY_KEYS.publisherA.handle,
        },
        license: 'CC-BY-4.0' as const,
        hosts: [{ placeholder: 'h1.invalid', role: 'portal' as const }],
        tasks: ['read_roster'],
        created_at: '2026-10-11T20:00:00Z',
      }
      const payload = { pkg_format: 'skillpkg/1' as const, manifest, content: graph }
      const signature = signPackagePayload(payload, TEST_ONLY_KEYS.publisherA.privateKey)

      // Adultera o grafo após assinatura
      const tamperedGraph = JSON.parse(JSON.stringify(graph))
      tamperedGraph.identity.description = 'Descrição adulterada'
      const tamperedPkg = { pkg_format: 'skillpkg/1' as const, manifest, content: tamperedGraph, signature }

      expect(verifyPackageSignature(tamperedPkg)).toBe(false)
    })
  })

  describe('4. Sanitização de Exportação', () => {
    it('bloqueia reexportação de grafos com proveniência imported', () => {
      const graph = loadBaseGraph('base_read_roster.json')
      graph.provenance = { source: 'imported', created_at: '2026-10-11T20:00:00Z' }
      expect(() => sanitizeGraphForExport(graph)).toThrow(CommunityError)
      try {
        sanitizeGraphForExport(graph)
      } catch (err: any) {
        expect(err.code).toBe('E_EXPORT_NOT_ALLOWED')
      }
    })

    it('bloqueia exportação se contiver CPF ou termo protegido', () => {
      const graph = loadBaseGraph('base_read_roster.json')
      graph.nodes.locate_table.label = 'Tabela de alunos com CPF 123.456.789-00'
      expect(() => sanitizeGraphForExport(graph)).toThrow(CommunityError)
      try {
        sanitizeGraphForExport(graph)
      } catch (err: any) {
        expect(err.code).toBe('E_EXPORT_PII_FOUND')
      }
    })
  })

  describe('5. Conformidade da Suíte DEV (12 Casos)', () => {
    const devBindings = {
      'h1.invalid': 'escola.paineldoaluno.com.br',
      'h2.invalid': 'login.microsoftonline.com',
    }
    const devContext = {
      portalId: 'portal_local_machado',
      nextVersion: 1,
    }

    it('dev_01_legit_read_roster: importa pacote legítimo e coloca em quarentena', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_01_legit_read_roster.skillpkg.json'), 'utf8')
      const res = await executeImportPipeline(pkgStr, {
        userBindings: devBindings,
        localContext: devContext,
      })
      expect(res.quarantined).toBe(true)
      expect(res.package.manifest.package_id).toBe('diario-roster')
      expect(res.effectsReport?.safety.sideEffectLevel).toBe('read')
      expect(res.effectsReport?.allClicks.length).toBe(0)
      expect(res.derivedGraph?.identity.portal_id).toBe('portal_local_machado')
      expect(res.derivedGraph?.identity.domain).toBe('escola.paineldoaluno.com.br')
    })

    it('dev_02_legit_lancar_falta: detecta nós de escrita no relatório de efeitos', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_02_legit_lancar_falta.skillpkg.json'), 'utf8')
      const res = await executeImportPipeline(pkgStr, {
        userBindings: devBindings,
        localContext: devContext,
      })
      expect(res.quarantined).toBe(true)
      const writeNodes = res.effectsReport?.riskyNodes.filter((n) => n.type === 'WRITE')
      expect(writeNodes?.length).toBeGreaterThan(0)
    })

    it('dev_03_legit_idp_auth: aceita IdP conhecido de autenticação', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_03_legit_idp_auth.skillpkg.json'), 'utf8')
      const res = await executeImportPipeline(pkgStr, {
        userBindings: devBindings,
        localContext: devContext,
      })
      expect(res.quarantined).toBe(true)
      expect(res.derivedGraph?.safety.allowed_hosts).toContain('login.microsoftonline.com')
    })

    it('dev_04_legit_version_bump: aceita mapa versionado com map_version 2', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_04_legit_version_bump.skillpkg.json'), 'utf8')
      const res = await executeImportPipeline(pkgStr, {
        userBindings: devBindings,
        localContext: devContext,
      })
      expect(res.quarantined).toBe(true)
      expect(res.package.manifest.map_version).toBe(2)
    })

    it('dev_05_hostile_unsigned: rejeita com E_PKG_UNSIGNED', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_05_hostile_unsigned.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_UNSIGNED' })
      )
    })

    it('dev_06_hostile_tampered_sig: rejeita com E_PKG_SIGNATURE_INVALID', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_06_hostile_tampered_sig.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_SIGNATURE_INVALID' })
      )
    })

    it('dev_07_hostile_unbound_real_host: rejeita com E_PKG_UNBOUND_HOST', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_07_hostile_unbound_real_host.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_UNBOUND_HOST' })
      )
    })

    it('dev_08_hostile_key_mismatch: rejeita com E_PKG_KEY_MISMATCH', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_08_hostile_key_mismatch.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_KEY_MISMATCH' })
      )
    })

    it('dev_09_hostile_oversized_package: rejeita com E_PKG_TOO_LARGE', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_09_hostile_oversized_package.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_TOO_LARGE' })
      )
    })

    it('dev_10_hostile_unsafe_control_text: rejeita com E_PKG_UNSAFE_TEXT', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_10_hostile_unsafe_control_text.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_UNSAFE_TEXT' })
      )
    })

    it('dev_11_hostile_redos_regex: rejeita com E_PKG_UNSAFE_REGEX', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_11_hostile_redos_regex.skillpkg.json'), 'utf8')
      await expect(executeImportPipeline(pkgStr, { userBindings: devBindings })).rejects.toThrowError(
        expect.objectContaining({ code: 'E_PKG_UNSAFE_REGEX' })
      )
    })

    it('dev_12_hostile_version_rollback: rejeita com E_PKG_ROLLBACK', async () => {
      const pkgStr = fs.readFileSync(path.join(OUT_DEV_DIR, 'dev_12_hostile_version_rollback.skillpkg.json'), 'utf8')
      const fakeStore = {
        getMaxSeenVersion: async () => 2,
        recordSeenVersion: async () => {},
      }
      await expect(
        executeImportPipeline(pkgStr, {
          userBindings: devBindings,
          seenVersionsStore: fakeStore,
        })
      ).rejects.toThrowError(expect.objectContaining({ code: 'E_PKG_ROLLBACK' }))
    })
  })

  describe('6. Teste de Equivalência Estrita (assertAllowedDifferencesOnly)', () => {
    it('falha se o grafo derivado contiver modificações não autorizadas', () => {
      const original = loadBaseGraph('base_read_roster.json')
      const derived = JSON.parse(JSON.stringify(original))

      // Muta um seletor silenciosamente
      derived.nodes.locate_table.anchor.candidates[0].selector = '#injected-selector'

      const bindings = { 'h1.invalid': 'escola.paineldoaluno.com.br' }
      expect(() => assertAllowedDifferencesOnly(original, derived, bindings)).toThrow(CommunityError)
    })
  })

  describe('7. Regras de Ativação da Quarentena', () => {
    it('bloqueia ativação sem aceitação do relatório de efeitos', () => {
      const res = canActivate({
        currentState: 'quarantined',
        trustLevel: 'assinado_confiavel',
        effectsConfirmed: false,
        dryRunCompleted: true,
      })
      expect(res.allowed).toBe(false)
      expect(res.reason).toContain('relatório de efeitos')
    })

    it('bloqueia ativação sem dry-run concluído', () => {
      const res = canActivate({
        currentState: 'quarantined',
        trustLevel: 'assinado_confiavel',
        effectsConfirmed: true,
        dryRunCompleted: false,
      })
      expect(res.allowed).toBe(false)
      expect(res.reason).toContain('Dry-run')
    })

    it('bloqueia chave desconhecida sem autorização explícita', () => {
      const res = canActivate({
        currentState: 'quarantined',
        trustLevel: 'assinado_desconhecido',
        effectsConfirmed: true,
        dryRunCompleted: true,
        untrustedConfirmed: false,
      })
      expect(res.allowed).toBe(false)
      expect(res.reason).toContain('autores desconhecidos')
    })

    it('permite ativação quando todas as condições são satisfeitas', () => {
      const res = canActivate({
        currentState: 'quarantined',
        trustLevel: 'assinado_confiavel',
        effectsConfirmed: true,
        dryRunCompleted: true,
      })
      expect(res.allowed).toBe(true)
    })
  })

  describe('8. Persistência SQLite Comunitária e Enforcement de Quarentena', () => {
    class MemoryDriver {
      public db: any
      constructor() {
        this.db = new DatabaseSync(':memory:')
      }
      async execute(sql: string, params: unknown[] = []) {
        const stmt = this.db.prepare(sql)
        stmt.run(...params)
      }
      async query(sql: string, params: unknown[] = []) {
        const stmt = this.db.prepare(sql)
        return stmt.all(...params)
      }
      async queryOne(sql: string, params: unknown[] = []) {
        const stmt = this.db.prepare(sql)
        return stmt.get(...params) || null
      }
      async transaction(cb: any) {
        this.db.exec('BEGIN')
        try {
          const res = await cb(this)
          this.db.exec('COMMIT')
          return res
        } catch (e) {
          this.db.exec('ROLLBACK')
          throw e
        }
      }
    }

    it('migra v1 e v2 com sucesso e cria tabelas comunitárias', async () => {
      const driver = new MemoryDriver()
      const runner = new MigrationRunner(driver as any)
      const res = await runner.run()
      expect(res.applied).toBe(2)

      const tables = await driver.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'community_%'"
      )
      const names = tables.map((t: any) => t.name)
      expect(names).toContain('community_packages')
      expect(names).toContain('community_trusted_keys')
      expect(names).toContain('community_seen_versions')
      expect(names).toContain('community_quarantine_events')
    })

    it('SqlCommunityRepository gerencia pacotes, chaves confiáveis e versões vistas', async () => {
      const driver = new MemoryDriver()
      const runner = new MigrationRunner(driver as any)
      await runner.run()

      const repo = new SqlCommunityRepository(driver as any)

      // 1. Chaves confiáveis
      expect(await repo.isTrusted('chave_123')).toBe(false)
      await repo.pinTrustedKey('chave_123', 'prof_ana')
      expect(await repo.isTrusted('chave_123')).toBe(true)

      // 2. Proteção de Rollback
      expect(await repo.getMaxSeenVersion('chave_123', 'mapa_diario')).toBe(null)
      await repo.recordSeenVersion('chave_123', 'mapa_diario', 2)
      expect(await repo.getMaxSeenVersion('chave_123', 'mapa_diario')).toBe(2)

      // 3. Salvar e recuperar pacote
      const mockPkg: any = {
        pkg_format: 'skillpkg/1',
        manifest: {
          package_id: 'mapa_diario',
          map_version: 2,
          spec_version: '2.0',
          publisher: { key_id: 'chave_123', handle: 'prof_ana' },
          license: 'CC-BY-4.0',
          hosts: [{ placeholder: 'h1.invalid', role: 'portal' }],
          tasks: ['read_roster'],
          created_at: '2026-10-11T20:00:00Z',
        },
        content: loadBaseGraph('base_read_roster.json'),
        signature: { alg: 'ed25519', key_id: 'chave_123', public_key: 'aabb', sig: 'ccdd' },
      }

      await repo.savePackage(mockPkg, JSON.stringify(mockPkg), 'quarantined')
      expect(await repo.getPackageStatus('mapa_diario', 2)).toBe('quarantined')

      const events = await repo.getQuarantineEvents('mapa_diario', 2)
      expect(events.length).toBeGreaterThan(0)
      expect(events[0].event_type).toBe('quarantined')

      // 4. Transição de status para ativado
      await repo.setPackageStatus('mapa_diario', 2, 'activated', { dryRunSuccess: true })
      expect(await repo.getPackageStatus('mapa_diario', 2)).toBe('activated')
    })

    it('SqlSkillGraphRepository bloqueia recuperação e ativação de mapas em quarentena (E_GRAPH_QUARANTINED)', async () => {
      const driver = new MemoryDriver()
      const runner = new MigrationRunner(driver as any)
      await runner.run()

      const commRepo = new SqlCommunityRepository(driver as any)
      const graphRepo = new SqlSkillGraphRepository(driver as any)

      // Salva pacote comunitário em quarentena
      const mockPkg: any = {
        pkg_format: 'skillpkg/1',
        manifest: {
          package_id: 'mapa_quarentena',
          map_version: 1,
          spec_version: '2.0',
          publisher: { key_id: 'chave_pub', handle: 'prof_pub' },
          license: 'CC-BY-4.0',
          hosts: [{ placeholder: 'h1.invalid', role: 'portal' }],
          tasks: ['lancar_falta'],
          created_at: '2026-10-11T20:00:00Z',
        },
        content: loadBaseGraph('base_lancar_falta.json'),
        signature: { alg: 'ed25519', key_id: 'chave_pub', public_key: '1122', sig: '3344' },
      }
      await commRepo.savePackage(mockPkg, JSON.stringify(mockPkg), 'quarantined')

      // Salva grafo localmente marcado como imported
      const importedGraph = loadBaseGraph('base_lancar_falta.json')
      importedGraph.identity.portal_id = 'escola_local'
      importedGraph.identity.task_id = 'mapa_quarentena'
      importedGraph.identity.version = 1
      importedGraph.provenance = {
        source: 'imported',
        package_id: 'mapa_quarentena',
        map_version: 1,
        created_at: '2026-10-11T20:00:00Z',
      }
      await graphRepo.save(importedGraph)

      // Tentativa de carregar via get() deve lançar E_GRAPH_QUARANTINED
      await expect(graphRepo.get('escola_local', 'mapa_quarentena', 1)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_GRAPH_QUARANTINED' })
      )

      // Tentativa de marcar ativo via setActive() deve lançar E_GRAPH_QUARANTINED
      await expect(graphRepo.setActive('escola_local', 'mapa_quarentena', 1)).rejects.toThrowError(
        expect.objectContaining({ code: 'E_GRAPH_QUARANTINED' })
      )

      // Ativação do pacote na comunidade
      await commRepo.setPackageStatus('mapa_quarentena', 1, 'activated')

      // Agora get() e setActive() devem passar com sucesso!
      const activeGraph = await graphRepo.get('escola_local', 'mapa_quarentena', 1)
      expect(activeGraph).not.toBeNull()
      expect(activeGraph?.identity.task_id).toBe('mapa_quarentena')

      const activated = await graphRepo.setActive('escola_local', 'mapa_quarentena', 1)
      expect(activated).toBe(true)
    })
  })
})
