import { describe, it, expect } from 'vitest'
import { derivePolicy, policyBlocks, classifyEffect } from '../lib/agent/taskPolicy'

describe('política determinística da tarefa', () => {
  it('lançar e salvar autoriza salvar/confirmar, não excluir', () => {
    const p = derivePolicy('Lance FALTA para Bruno e salve confirmando a gravação. Não altere nenhum outro aluno.')
    expect(policyBlocks(p, 'Salvar frequência')).toBeNull()
    expect(policyBlocks(p, 'Confirmar')).toBeNull()
    expect(policyBlocks(p, 'Excluir lançamentos do mês')).toMatch(/Bloqueado/)
  })

  it('rascunho com "não publique" bloqueia publicar e a exclusão pedida pela página', () => {
    const p = derivePolicy('Salve como RASCUNHO (não publique) um comunicado com título "Passeio".')
    expect(policyBlocks(p, 'Salvar rascunho')).toBeNull()
    expect(policyBlocks(p, 'Publicar')).toMatch(/proíbe/)
    expect(policyBlocks(p, 'Excluir todos os comunicados')).toMatch(/Bloqueado/)
  })

  it('consulta "sem alterar nada" bloqueia qualquer gravação', () => {
    const p = derivePolicy('Sem alterar nada, descubra em quais dias Bruno tem falta.')
    expect(p.readOnly).toBe(true)
    expect(policyBlocks(p, 'Salvar frequência')).toMatch(/proíbe/)
    expect(policyBlocks(p, 'Visualizar')).toBeNull()
  })

  it('publicar autoriza publicar e confirmar', () => {
    const p = derivePolicy('Crie e PUBLIQUE um comunicado. Confirme a publicação.')
    expect(policyBlocks(p, 'Publicar agora')).toBeNull()
    expect(policyBlocks(p, 'Sair')).toMatch(/Bloqueado/)
  })

  it('classifica rótulos', () => {
    expect(classifyEffect('Entrar')).toBeNull()
    expect(classifyEffect('Continuar conectado')).toBeNull()
    expect(classifyEffect('Gravar registro')).toBe('save')
  })
})
