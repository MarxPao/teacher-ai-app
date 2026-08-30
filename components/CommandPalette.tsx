'use client'

import React, { useState, useEffect } from 'react'
import { ModuleKey } from '@/app/page'
import { t } from '@/lib/i18n'

interface CommandItem {
  id: string
  title: string
  subtitle: string
  category: 'Módulos' | 'Ações Rápida' | 'Configurações'
  icon: string
  action: () => void
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onNavigate: (key: ModuleKey) => void
}

export default function CommandPalette({ isOpen, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
        else {
          // Open
          window.dispatchEvent(new CustomEvent('teacher:toggle_command_palette'))
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const commands: CommandItem[] = [
    { id: 'nav-dashboard',      title: 'Painel Principal',              subtitle: 'Ir para a visão geral do professor',             category: 'Módulos', icon: 'ti-dashboard',      action: () => { onNavigate('dashboard'); onClose() } },
    { id: 'nav-exam',           title: 'Gerador de Provas (ELT/ENEM)',  subtitle: 'Criar prova com matriz de referência',            category: 'Módulos', icon: 'ti-file-text',      action: () => { onNavigate('exam'); onClose() } },
    { id: 'nav-lessonstudio',   title: 'Estúdio de Aulas (PPP/TKT)',    subtitle: 'Gerar plano de aula completo',                    category: 'Módulos', icon: 'ti-school',         action: () => { onNavigate('lessonstudio'); onClose() } },
    { id: 'nav-quick',          title: 'Quick Generate',                subtitle: 'Gerar atividades em segundos',                   category: 'Módulos', icon: 'ti-bolt',           action: () => { onNavigate('quick'); onClose() } },
    { id: 'nav-gradebook',      title: 'Caderneta de Notas',            subtitle: 'Lançar e calcular médias dos alunos',             category: 'Módulos', icon: 'ti-chart-bar',      action: () => { onNavigate('gradebook'); onClose() } },
    { id: 'nav-omnigrader',     title: 'OmniCorretor (OCR)',            subtitle: 'Corrigir prova via foto/câmera',                 category: 'Módulos', icon: 'ti-camera',         action: () => { onNavigate('omnigrader'); onClose() } },
    { id: 'nav-portalmirror',   title: 'Portal Mirror (Conectado)',     subtitle: 'Espelhar diários em portais escolares',           category: 'Módulos', icon: 'ti-plug-connected', action: () => { onNavigate('portalmirror'); onClose() } },
    { id: 'nav-repo',           title: 'Biblioteca RAG',                subtitle: 'Gerenciar livros e documentos indexados',         category: 'Módulos', icon: 'ti-books',          action: () => { onNavigate('repo'); onClose() } },
    { id: 'nav-trello',         title: 'Trello & Quadros',              subtitle: 'Sincronizar tarefas, listas e cartões do Trello', category: 'Módulos', icon: 'ti-layout-kanban',  action: () => { onNavigate('trello'); onClose() } },
    { id: 'nav-mindmap',        title: 'Mapa Mental IA',                subtitle: 'Visualizar e criar mapas de tópicos',             category: 'Módulos', icon: 'ti-hierarchy-2',    action: () => { onNavigate('mindmap'); onClose() } },
    { id: 'nav-api',            title: 'Modelos de IA & Tokens',        subtitle: 'Configurar chaves e monitor de consumo',          category: 'Configurações', icon: 'ti-brain',     action: () => { onNavigate('api'); onClose() } },
    { id: 'nav-settings',       title: 'Preferências do Professor',     subtitle: 'Configurar perfil e escola',                      category: 'Configurações', icon: 'ti-settings',  action: () => { onNavigate('settings'); onClose() } },
    { id: 'action-inspect',     title: 'Inspecionar Portal com Rafinha',subtitle: 'Ler tela do portal escolar ativo',                category: 'Ações Rápida', icon: 'ti-eye',       action: () => { onNavigate('portalmirror'); onClose() } },
    { id: 'action-autoreport',  title: 'Gerar Relatório Mensal HD',     subtitle: 'Exportar relatório formal em PDF/Word',           category: 'Ações Rápida', icon: 'ti-file-report',action: () => { onNavigate('autoreport'); onClose() } },
  ]

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.subtitle.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,54,66,0.65)', backdropFilter: 'blur(6px)',
        zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh',
        animation: 'fadeIn 0.15s ease'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, background: '#fff', borderRadius: 18,
          boxShadow: '0 20px 50px rgba(44,26,14,0.3)', border: '1px solid #ede8dc',
          overflow: 'hidden', display: 'flex', flexDirection: 'column'
        }}
      >
        {/* Barra de Pesquisa */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #ede8dc', gap: 12 }}>
          <i className="ti ti-search" style={{ fontSize: 20, color: '#b58900' }} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="Digite um comando ou módulo... (ex: Prova, Portal, Notas)"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#2c1a0e',
              fontFamily: 'inherit', background: 'transparent'
            }}
          />
          <kbd style={{ background: '#f5f0e8', color: '#7a5c42', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid #ede8dc' }}>
            ESC
          </kbd>
        </div>

        {/* Lista de Resultados */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#a08060', fontSize: 14 }}>
              Nenhum comando encontrado para "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: selectedIndex === idx ? '#f5f0e8' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'background 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: selectedIndex === idx ? '#8b5e3c' : 'rgba(139,94,60,0.1)',
                    color: selectedIndex === idx ? '#fff' : '#8b5e3c',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                  }}>
                    <i className={`ti ${item.icon}`} style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#2c1a0e' }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#7a5c42' }}>{item.subtitle}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a08060', background: '#fff', padding: '2px 8px', borderRadius: 6, border: '1px solid #ede8dc' }}>
                  {item.category}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Dica de Rodapé */}
        <div style={{ background: '#faf8f5', padding: '8px 16px', borderTop: '1px solid #ede8dc', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a08060' }}>
          <span>Navegue com a busca rápida do Teacher AI</span>
          <span>Atalho: <strong>Ctrl + K</strong> / <strong>Cmd + K</strong></span>
        </div>
      </div>
    </div>
  )
}
