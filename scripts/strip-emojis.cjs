/**
 * strip-emojis.cjs
 * Remove emojis de arquivos TSX/TS nos módulos do Teacher AI.
 * Substitui emojis isolados (no início de strings JSX) por string vazia.
 * Mantém qualquer texto adjacente.
 */

const fs = require('fs')
const path = require('path')

// Regex abrangente para emojis Unicode (inclui ZWJ sequences e variation selectors)
const EMOJI_REGEX = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|\ufe0f|\u200d)+/g

const MODULES_DIR = path.join(__dirname, '..', 'components', 'modules')
const EXTRA_FILES = [
  path.join(__dirname, '..', 'components', 'DocumentCanvas.tsx'),
  path.join(__dirname, '..', 'components', 'RafinhaChat.tsx'),
  path.join(__dirname, '..', 'components', 'Sidebar.tsx'),
  path.join(__dirname, '..', 'app', 'page.tsx'),
]

function stripEmojis(content) {
  // Remove emojis from JSX text and string literals
  // Strategy: replace emoji sequences with empty string, then clean up double spaces
  return content
    .replace(EMOJI_REGEX, '')
    .replace(/  +/g, ' ')         // collapse double spaces
    .replace(/\{ ' ' \}/g, '')    // remove orphaned {' '} that may result
    .replace(/^(\s*)\s+$/gm, '$1') // trim trailing spaces on lines
}

let totalFiles = 0
let totalEmojisRemoved = 0

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8')
  const cleaned = stripEmojis(original)
  
  // Count emoji occurrences removed
  const matches = original.match(EMOJI_REGEX) || []
  const count = matches.length
  
  if (count > 0) {
    fs.writeFileSync(filePath, cleaned, 'utf8')
    console.log(`[CLEANED] ${path.basename(filePath)} — ${count} emoji(s) removido(s)`)
    totalEmojisRemoved += count
  } else {
    console.log(`[SKIP]    ${path.basename(filePath)} — sem emojis`)
  }
  totalFiles++
}

// Process all module files
const moduleFiles = fs.readdirSync(MODULES_DIR)
  .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
  .map(f => path.join(MODULES_DIR, f))

console.log(`\n=== Teacher AI — Emoji Strip Script ===`)
console.log(`Processando ${moduleFiles.length} módulos + ${EXTRA_FILES.length} arquivos extras...\n`)

;[...moduleFiles, ...EXTRA_FILES].forEach(processFile)

console.log(`\n=== Concluído ===`)
console.log(`Arquivos processados: ${totalFiles}`)
console.log(`Total de emojis removidos: ${totalEmojisRemoved}`)
