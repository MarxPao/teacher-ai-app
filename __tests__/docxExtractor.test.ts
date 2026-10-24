import { describe, it, expect } from 'vitest';
import { extractDocxLayoutAndText } from '../lib/pdfExtractor';
import JSZip from 'jszip';

describe('DOCX Layout and Text Extractor (extractDocxLayoutAndText)', () => {
  it('extracts real margins, font family, font size, 2-column layout and text paragraphs from DOCX XML', async () => {
    const zip = new JSZip();

    // Mock document.xml
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>Colégio Machado Sobrinho</w:t></w:r>
        </w:p>
        <w:p>
          <w:r><w:t>Avaliação de Matemática - 9º Ano</w:t></w:r>
        </w:p>
        <w:sectPr>
          <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
          <w:cols w:num="2"/>
        </w:sectPr>
      </w:body>
    </w:document>`;
    zip.file('word/document.xml', docXml);

    // Mock styles.xml
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults>
        <w:rPrDefault>
          <w:rPr>
            <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
            <w:sz w:val="22"/>
          </w:rPr>
        </w:rPrDefault>
      </w:docDefaults>
    </w:styles>`;
    zip.file('word/styles.xml', stylesXml);

    const docxBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const result = await extractDocxLayoutAndText(docxBuffer);

    expect(result.text).toContain('Colégio Machado Sobrinho');
    expect(result.text).toContain('Avaliação de Matemática - 9º Ano');
    expect(result.fontFamily).toBe('Calibri');
    expect(result.fontSizePt).toBe(11); // 22 half-pts = 11pt
    expect(result.marginsMm?.top).toBeCloseTo(20, 0); // 1134 dxa ~ 20mm
    expect(result.columns).toBe(2);
  });
});
