'use client'

import React, { useState, useEffect } from 'react'
import { getCurrentLanguage, setLanguage, SupportedLanguage, t } from '@/lib/i18n'

export default function LanguageSelector() {
  const [lang, setLangState] = useState<SupportedLanguage>('pt')

  useEffect(() => {
    setLangState(getCurrentLanguage())
    const handler = () => setLangState(getCurrentLanguage())
    window.addEventListener('languagechange', handler)
    return () => window.removeEventListener('languagechange', handler)
  }, [])

  const handleChange = (newLang: SupportedLanguage) => {
    setLanguage(newLang)
    setLangState(newLang)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f5f0e8', padding: '4px 8px', borderRadius: 20, border: '1px solid #ede8dc' }}>
      <button
        onClick={() => handleChange('pt')}
        title="Português (Brasil)"
        style={{
          border: 'none', background: lang === 'pt' ? '#8b5e3c' : 'transparent',
          color: lang === 'pt' ? '#fff' : '#586e75', padding: '3px 8px', borderRadius: 14,
          fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
        }}
      >
        PT
      </button>
      <button
        onClick={() => handleChange('en')}
        title="English (United States)"
        style={{
          border: 'none', background: lang === 'en' ? '#8b5e3c' : 'transparent',
          color: lang === 'en' ? '#fff' : '#586e75', padding: '3px 8px', borderRadius: 14,
          fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
        }}
      >
        EN
      </button>
      <button
        onClick={() => handleChange('es')}
        title="Español"
        style={{
          border: 'none', background: lang === 'es' ? '#8b5e3c' : 'transparent',
          color: lang === 'es' ? '#fff' : '#586e75', padding: '3px 8px', borderRadius: 14,
          fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
        }}
      >
        ES
      </button>
    </div>
  )
}
