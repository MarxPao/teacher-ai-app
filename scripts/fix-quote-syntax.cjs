/**
 * fix-quote-syntax.cjs
 * Corrige aspas duplicadas em fontFamily geradas pelo script.
 */

const fs = require('fs')
const path = require('path')

const MODULES_DIR = path.join(__dirname, '..', 'components', 'modules')

const files = fs.readdirSync(MODULES_DIR).filter(f => f.endsWith('.tsx'))
let fixedCount = 0

for (const file of files) {
  const filePath = path.join(MODULES_DIR, file)
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // Substituir ''Plus Jakarta Sans', sans-serif' por "'Plus Jakarta Sans', sans-serif"
  content = content.replace(/''Plus Jakarta Sans',\s*sans-serif'/g, "\"'Plus Jakarta Sans', sans-serif\"")
  content = content.replace(/''Fraunces',\s*Georgia,\s*serif'/g, "\"'Fraunces', Georgia, serif\"")
  content = content.replace(/fontFamily:\s*''/g, "fontFamily: '")

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`[FIXED] ${file}`)
    fixedCount++
  }
}

console.log(`Fix completed. ${fixedCount} files fixed.`)
