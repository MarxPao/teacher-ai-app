/**
 * standardize-ui.cjs
 * Padronização tipográfica, headers e botões — Teacher AI
 * 
 * Mudanças:
 * - h1/h2: centralizar, Fraunces, #2c1a0e, sem itálico
 * - Fontes: padronizar para Fraunces (display) e Plus Jakarta Sans (corpo)
 * - Botões: substituir #268bd2, #073642 como cores primárias por #8b5e3c
 * - Botões sucesso: #859900 → #c4834a
 * - Remove subtítulos <p> logo após h1
 */

const fs = require('fs')
const path = require('path')

const MODULES_DIR = path.join(__dirname, '..', 'components', 'modules')
const EXTRA_FILES = [
  path.join(__dirname, '..', 'components', 'Sidebar.tsx'),
  path.join(__dirname, '..', 'app', 'page.tsx'),
]

let totalFiles = 0
let totalChanges = 0
const log = []

function applyReplacements(content, filename) {
  let changed = 0
  const original = content

  // ─── 1. FONTES DE DISPLAY: normalizar para Fraunces ─────────────────────
  const fontDisplayReplacements = [
    // Playfair Display → Fraunces
    [/"'Playfair Display', Georgia, serif"/g, "'Fraunces', Georgia, serif"],
    [/"Playfair Display", Georgia, serif/g, "'Fraunces', Georgia, serif"],
    [/'Playfair Display', Georgia, serif/g, "'Fraunces', Georgia, serif"],
    // Georgia serif puro → Fraunces (apenas em fontFamily: 'Georgia, serif')
    [/fontFamily: 'Georgia, serif'/g, "fontFamily: \"'Fraunces', Georgia, serif\""],
    [/fontFamily: "Georgia, serif"/g, "fontFamily: \"'Fraunces', Georgia, serif\""],
  ]
  for (const [regex, replacement] of fontDisplayReplacements) {
    const replaced = content.replace(regex, replacement)
    if (replaced !== content) { changed++; content = replaced }
  }

  // ─── 2. FONTES DE CORPO: padronizar para Plus Jakarta Sans ───────────────
  const fontBodyReplacements = [
    [/'Inter', system-ui, sans-serif/g, "'Plus Jakarta Sans', sans-serif"],
    [/"Inter", system-ui, sans-serif/g, "'Plus Jakarta Sans', sans-serif"],
    [/'Inter', system-ui/g, "'Plus Jakarta Sans', sans-serif"],
    [/Outfit, sans-serif/g, "'Plus Jakarta Sans', sans-serif"],
    [/fontFamily: "'Inter'"/g, "fontFamily: \"'Plus Jakarta Sans'\""],
  ]
  for (const [regex, replacement] of fontBodyReplacements) {
    const replaced = content.replace(regex, replacement)
    if (replaced !== content) { changed++; content = replaced }
  }

  // ─── 3. COR DOS TÍTULOS: #073642 → #2c1a0e em h1/h2 ────────────────────
  // Apenas linhas que contêm <h1 ou <h2 e a cor #073642
  content = content.replace(
    /(<h[12][^>]*color: ')#073642(')/g,
    (_, pre, post) => `${pre}#2c1a0e${post}`
  )
  content = content.replace(
    /(<h[12][^>]*color: ")#073642(")/g,
    (_, pre, post) => `${pre}#2c1a0e${post}`
  )

  // ─── 4. REMOVER fontStyle: 'italic' de h1 ───────────────────────────────
  // Remove o atributo apenas em linhas que já contêm <h1
  content = content.replace(
    /(<h1[^>]*),\s*fontStyle:\s*['"]italic['"]/g,
    (match, pre) => pre
  )
  content = content.replace(
    /fontStyle:\s*['"]italic['"],?\s*(<\/h1)/g,
    (_, rest) => rest
  )

  // ─── 5. CENTRALIZAR h1 (textAlign: 'center') ────────────────────────────
  // Adiciona textAlign: 'center' em h1 que não o têm
  content = content.replace(
    /<h1 style=\{\{([^}]*)\}\}/g,
    (match, inner) => {
      if (inner.includes('textAlign')) return match
      return `<h1 style={{ textAlign: 'center', ${inner.trim().replace(/^,/, '')} }}`
    }
  )

  // ─── 6. BOTÕES PRIMÁRIOS: azul/teal → marrom ────────────────────────────
  // background: '#268bd2' em botões → #8b5e3c
  content = content.replace(/background:\s*'#268bd2'/g, "background: '#8b5e3c'")
  content = content.replace(/background:\s*"#268bd2"/g, 'background: "#8b5e3c"')

  // background: '#073642' em botões (não em page backgrounds)
  // Cuidado: só substituir em contextos de button/btn
  content = content.replace(
    /(S\.btn[^}]*background:\s*|\.btn[^,]*background:\s*)['"]#073642['"]/g,
    (match) => match.replace('#073642', '#2c1a0e')
  )

  // ─── 7. BOTÕES SUCESSO: verde → âmbar ────────────────────────────────────
  content = content.replace(/background:\s*'#859900'/g, "background: '#c4834a'")
  content = content.replace(/background:\s*"#859900"/g, 'background: "#c4834a"')
  content = content.replace(/background:\s*'#2aa198'/g, "background: '#8b7355'")  // teal → sépia
  content = content.replace(/background:\s*"#2aa198"/g, 'background: "#8b7355"')

  // ─── 8. LETTERSP ACING em h1 ─────────────────────────────────────────────
  // Remove letterSpacing negativo de h1 (fica mais limpo com Fraunces)
  content = content.replace(
    /(<h1[^>]*),\s*letterSpacing:\s*['"]-[^'"]+['"]/g,
    (_, pre) => pre
  )

  if (content !== original) {
    changed++
    return { content, changed: true }
  }
  return { content, changed: false }
}

// ── Processar todos os arquivos ─────────────────────────────────────────────
const moduleFiles = fs.readdirSync(MODULES_DIR)
  .filter(f => f.endsWith('.tsx'))
  .map(f => path.join(MODULES_DIR, f))

const allFiles = [...moduleFiles, ...EXTRA_FILES]

console.log('=== Teacher AI — UI Standardization Script ===')
console.log(`Processando ${allFiles.length} arquivos...\n`)

for (const filePath of allFiles) {
  const filename = path.basename(filePath)
  try {
    const original = fs.readFileSync(filePath, 'utf8')
    const { content, changed } = applyReplacements(original, filename)

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8')
      console.log(`[UPDATED] ${filename}`)
      totalChanges++
    } else {
      console.log(`[SKIP]    ${filename} — sem alterações`)
    }
    totalFiles++
  } catch (err) {
    console.log(`[ERROR]   ${filename} — ${err.message}`)
  }
}

console.log(`\n=== Concluído ===`)
console.log(`Arquivos processados: ${totalFiles}`)
console.log(`Arquivos alterados:   ${totalChanges}`)
