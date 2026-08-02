import React from 'react'
import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidade & LGPD | Teacher AI',
  description: 'Aviso de Privacidade e Conformidade com a LGPD (Lei 13.709/2018).'
}

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '40px 20px', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: '#2c1a0e', lineHeight: 1.7 }}>
      <Link href="/" style={{ color: '#8b5e3c', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
        ← Voltar ao Teacher AI
      </Link>

      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, fontWeight: 800, marginTop: 20, marginBottom: 10, color: '#3d2510' }}>
        Política de Privacidade & LGPD
      </h1>
      <p style={{ fontSize: 13, color: '#665c54' }}>Conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</p>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(139,115,85,0.2)', margin: '24px 0' }} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2>1. Compromisso com a Privacidade</h2>
        <p>
          O <strong>Teacher AI</strong> respeita a privacidade de professores, alunos e instituições. Tratamos os dados pessoais em estrita observância aos princípios da minimização, necessidade e transparência.
        </p>

        <h2>2. Coleta e Finalidade dos Dados</h2>
        <p>
          Os dados cadastrados (como nomes de turmas, dados de alunos particulares e materiais pedagógicos) são utilizados exclusivamente para o gerenciamento escolar, compilação de relatórios e personalização das aulas.
        </p>

        <h2>3. Direitos do Titular (Art. 18 da LGPD)</h2>
        <p>
          O usuário possui direito a:
        </p>
        <ul>
          <li><strong>Portabilidade de Dados</strong>: Exportação completa das informações cadastradas em arquivo legível (.JSON).</li>
          <li><strong>Direito ao Esquecimento / Exclusão</strong>: Eliminação definitiva e irreversível dos dados pessoais através do painel de Configurações.</li>
          <li><strong>Confirmação e Acesso</strong>: Acesso em tempo real aos dados armazenados.</li>
        </ul>

        <h2>4. Processamento via Inteligência Artificial</h2>
        <p>
          Trechos pedagógicos de planos de aula e exercícios podem ser enviados para APIs de modelos de linguagem (OpenAI/Google Gemini) estritamente para a geração das atividades requeridas, sem compartilhamento com terceiros para fins publicitários.
        </p>
      </section>
    </div>
  )
}
