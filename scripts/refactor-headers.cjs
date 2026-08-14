/**
 * refactor-headers.cjs
 * 
 * 1. Centraliza os títulos (h1/h2) no topo das páginas de todas as funcionalidades.
 * 2. Remove legendas descritivas (<p style={{ color: '#586e75'... }}> ou simular) diretamente abaixo dos h1/h2 de cabeçalho.
 * 3. Organiza os botões de ação do topo centralizados logo abaixo do título (se existirem).
 * 4. Garante que todas as cores de botões e títulos sigam a paleta Paper & Ink (#2c1a0e para títulos, #8b5e3c para botões).
 */

const fs = require('fs')
const path = require('path')

const MODULES_DIR = path.join(__dirname, '..', 'components', 'modules')

let updatedCount = 0

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // 1. Remover parágrafos de descrição logo abaixo de <h1... > ... </h1>
  // Ex: <p style={{ color: '#586e75' ... }}>...</p> ou <p style={{ color: '#93a1a1' ... }}>...</p>
  content = content.replace(
    /(<h1[^>]*>[\s\S]*?<\/h1>)\s*<p style=\{\{[^}]*(?:color:\s*['"]#(?:586e75|93a1a1|665c54|5c3d20)['"])[^}]*\}\}[^>]*>[\s\S]*?<\/p>/gi,
    '$1'
  )

  // Remover <p>Genérico de subtítulo em headers flex
  content = content.replace(
    /(<h1[^>]*>[\s\S]*?<\/h1>)\s*<p class(?:Name)?="[^"]*text-(?:gray|slate|muted|sol-sub)[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
    '$1'
  )

  // 2. Reestruturar containers de header flex com justifyContent: 'space-between' para layout empilhado centralizado
  // De: <div style={{ marginBottom: 20/24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'... }}>
  //     <div> <h1...>Título</h1> </div> <div style={{ display: 'flex', gap: 10 }}>...</div> </div>
  // Para: layout centralizado com h1 no centro e botões abaixo centralizados

  content = content.replace(
    /<div style=\{\{\s*marginBottom:\s*\d+,\s*display:\s*['"]flex['"],\s*justifyContent:\s*['"]space-between['"],\s*alignItems:\s*['"](?:flex-end|center)['"]([^}]*)\}\}>/gi,
    '<div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14$1 }}>'
  )

  // 3. Centralizar a div de botões do cabeçalho caso tenha sido flex space-between
  content = content.replace(
    /(<div style=\{\{\s*marginBottom:\s*24,\s*display:\s*["']flex["'],\s*flexDirection:\s*["']column["'],\s*alignItems:\s*["']center["'][\s\S]*?<h1[\s\S]*?<\/h1>\s*(?:<\/div>)?)\s*<div style=\{\{\s*display:\s*['"]flex['"],\s*gap:\s*(\d+)/gi,
    '$1\n      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: $2'
  )

  // 4. Garantir que h1 tenham textAlign: 'center', fontFamily Fraunces, color '#2c1a0e'
  content = content.replace(
    /<h1 style=\{\{([^}]*)\}\}/gi,
    (match, styleContent) => {
      let styles = styleContent

      // Atualiza textAlign
      if (styles.includes('textAlign')) {
        styles = styles.replace(/textAlign:\s*['"][^'"]+['"]/g, "textAlign: 'center'")
      } else {
        styles = `textAlign: 'center', ${styles}`
      }

      // Atualiza fontFamily
      if (styles.includes('fontFamily')) {
        styles = styles.replace(/fontFamily:\s*['"][^'"]+['"]/g, "fontFamily: \"'Fraunces', Georgia, serif\"")
      } else {
        styles = `${styles}, fontFamily: \"'Fraunces', Georgia, serif\"`
      }

      // Atualiza color
      if (styles.includes('color')) {
        styles = styles.replace(/color:\s*['"]#(?:073642|002b36|1a110a|000|111)['"]/g, "color: '#2c1a0e'")
      }

      // Garante margin: 0 ou margin '0 auto'
      styles = styles.replace(/margin:\s*0/g, "margin: '0 auto'")

      return `<h1 style={{ ${styles} }}`
    }
  )

  // 5. Botões residuais fora da paleta (substituição geral de bordas/fundos azuis e verdes para marrom/âmbar)
  content = content.replace(/border:\s*'1px solid #073642'/g, "border: '1px solid #8b5e3c'")
  content = content.replace(/border:\s*"1px solid #073642"/g, 'border: "1px solid #8b5e3c"')
  content = content.replace(/color:\s*'#073642'/g, (m, offset, str) => {
    // se estiver dentro de botão ou badge
    const surrounding = str.slice(Math.max(0, offset - 100), offset + 100)
    if (surrounding.includes('button') || surrounding.includes('btn') || surrounding.includes('Badge')) {
      return "color: '#2c1a0e'"
    }
    return m
  })

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`[HEADER REFACTORED] ${path.basename(filePath)}`)
    updatedCount++
  } else {
    console.log(`[NO CHANGE] ${path.basename(filePath)}`)
  }
}

console.log('=== Processing Module Headers ===')
const files = fs.readdirSync(MODULES_DIR).filter(f => f.endsWith('.tsx'))
for (const file of files) {
  processFile(path.join(MODULES_DIR, file))
}
console.log(`Done. Updated ${updatedCount} files.`)
