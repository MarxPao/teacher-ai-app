const fs = require('fs');
const path = require('path');

function cleanDirectory(dir) {
  let cleanedCount = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (file.name !== 'node_modules' && file.name !== '.next' && file.name !== '.git') {
        cleanedCount += cleanDirectory(fullPath);
      }
    } else if (file.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.json'))) {
      const buffer = fs.readFileSync(fullPath);
      if (buffer.includes(0)) {
        console.log('Cleaning null bytes from:', fullPath);
        // Filter out null bytes (0x00)
        const cleanedBuffer = Buffer.from(buffer.filter(byte => byte !== 0));
        fs.writeFileSync(fullPath, cleanedBuffer);
        cleanedCount++;
      }
    }
  }
  return cleanedCount;
}

const totalCleaned = cleanDirectory(__dirname);
console.log(`[OK] Finished! Cleaned ${totalCleaned} files.`);
