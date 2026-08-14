const fs = require('fs');
const path = require('path');

function fixEncoding(dir) {
  let fixedCount = 0;
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(item.name)) {
        fixedCount += fixEncoding(fullPath);
      }
    } else if (item.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.json'))) {
      const buf = fs.readFileSync(fullPath);
      if ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF) || buf.includes(0)) {
        console.log('Fixing UTF-16 encoding for:', fullPath);
        let str = '';
        if ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF)) {
          str = buf.toString('utf16le');
        } else {
          const nulls = buf.filter(b => b === 0).length;
          if (nulls > buf.length / 4) {
            str = buf.toString('utf16le');
          } else {
            str = Buffer.from(buf.filter(b => b !== 0)).toString('utf8');
          }
        }
        str = str.replace(/^\uFEFF/, '');
        fs.writeFileSync(fullPath, str, 'utf8');
        fixedCount++;
      }
    }
  }
  return fixedCount;
}

const count = fixEncoding(__dirname);
console.log(`[OK] Successfully converted ${count} UTF-16 files to UTF-8.`);
