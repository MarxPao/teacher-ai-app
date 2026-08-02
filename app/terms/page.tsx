import React from 'react'
import Link from 'next/link'

export const metadata = {
  title: 'Termos de Uso | Teacher AI',
  description: 'Termos e Condições de Uso da Plataforma Teacher AI.'
}

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#2c1a0e', lineHeight: 1.7 }}>
      <Link href="/" style={{ color: '#8b5e3c', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
        ← Voltar ao Teacher AI
      </Link>

      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 800, marginTop: 20, marginBottom: 10, color: '#3d2510' }}>
        Termos e Condições de Uso
      </h1>
      <p style={{ fontSize: 13, color: '#665c54' }}>Última atualização: 02 de Agosto de 2026</p>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(139,115,85,0.2)', margin: '24px 0' }} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2>1. Aceitação dos Termos</h2>
        <p>
          Ao acessar e utilizar a plataforma <strong>Teacher AI</strong>, você concorda com estes Termos de Uso. O Teacher AI é um assistente agêntico voltado ao auxílio pedagógico de professores e instituições de ensino.
        </p>

        <h2>2. Uso da Inteligência Artificial e Modelos</h2>
        <p>
          O Teacher AI integra modelos de inteligência artificial de terceiros (como OpenAI, Google Gemini e Anthropic). O conteúdo gerado deve ser revisado pelo educador antes de ser utilizado em avaliações oficiais ou impresso.
        </p>

        <h2>3. Responsabilidade Pedagógica</h2>
        <p>
          O professor permanece como autoridade final e responsável pela revisão das notas, planos de aula e boletins gerados com o auxílio do aplicativo.
        </p>

        <h2>4. Alterações nos Termos</h2>
        <p>
          Estes termos podem ser atualizados periodicamente para refletir melhorias no sistema e alterações legislativas.
        </p>
      </section>
    </div>
  )
}
