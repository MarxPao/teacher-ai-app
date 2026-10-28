/**
 * lib/interop/qti.ts — QTI 2.1 Export (Gap 11 · Onda 3)
 *
 * Exporta questões do banco interno para o padrão IMS QTI 2.1 XML,
 * compatível com Moodle, Canvas, Blackboard e outros LMS.
 *
 * Referência: IMS Global QTI 2.1 Specification
 * https://www.imsglobal.org/question/qtiv2p1/imsqti_infov2p1.html
 */

/* ─── Types internos ─────────────────────────────────────────────────────────── */
export interface QtiChoice {
  id:   string
  text: string
}

export interface QtiItem {
  id:         string
  title:      string
  prompt:     string
  choices:    QtiChoice[]
  correctId:  string          // id da QtiChoice correta
  difficulty?: number         // 0–1 (opcional, vira metadata)
  skill?:     string          // código BNCC ou habilidade
  points?:    number
}

export interface QtiManifest {
  identifier: string
  title:      string
  items:      QtiItem[]
}

/* ─── Helpers XML ────────────────────────────────────────────────────────────── */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/* ─── Item XML ───────────────────────────────────────────────────────────────── */
function itemToQti(item: QtiItem): string {
  const choiceXml = item.choices.map(c =>
    `      <simpleChoice identifier="${esc(c.id)}">${esc(c.text)}</simpleChoice>`
  ).join('\n')

  return `<assessmentItem
  xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imsqti_v2p1 http://www.imsglobal.org/xsd/imsqti_v2p1.xsd"
  identifier="${esc(item.id)}"
  title="${esc(item.title)}"
  adaptive="false"
  timeDependent="false">

  <responseDeclaration identifier="RESPONSE" cardinality="single" baseType="identifier">
    <correctResponse>
      <value>${esc(item.correctId)}</value>
    </correctResponse>
  </responseDeclaration>

  <outcomeDeclaration identifier="SCORE" cardinality="single" baseType="float">
    <defaultValue><value>0</value></defaultValue>
  </outcomeDeclaration>

  <itemBody>
    <choiceInteraction responseIdentifier="RESPONSE" shuffle="false" maxChoices="1">
      <prompt>${esc(item.prompt)}</prompt>
${choiceXml}
    </choiceInteraction>
  </itemBody>

  <responseProcessing>
    <responseCondition>
      <responseIf>
        <match>
          <variable identifier="RESPONSE"/>
          <correct identifier="RESPONSE"/>
        </match>
        <setOutcomeValue identifier="SCORE">
          <baseValue baseType="float">${item.points ?? 1}</baseValue>
        </setOutcomeValue>
      </responseIf>
    </responseCondition>
  </responseProcessing>

  ${item.difficulty !== undefined ? `<!-- difficulty: ${item.difficulty.toFixed(2)} -->` : ''}
  ${item.skill ? `<!-- skill: ${esc(item.skill)} -->` : ''}
</assessmentItem>`
}

/* ─── Manifest (imsmanifest.xml) ─────────────────────────────────────────── */
function buildManifest(manifest: QtiManifest, itemFilenames: string[]): string {
  const resources = itemFilenames.map((fn, i) =>
    `    <resource identifier="${manifest.items[i].id}" type="imsqti_item_xmlv2p1" href="${fn}">
      <file href="${fn}"/>
    </resource>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  identifier="${esc(manifest.identifier)}"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd">

  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
  </metadata>

  <organizations/>

  <resources>
${resources}
  </resources>
</manifest>`
}

/* ─── API Principal ──────────────────────────────────────────────────────────── */

/**
 * Exporta um array de itens para QTI 2.1.
 * Retorna um Record { filename: xmlString } pronto para criar zip ou baixar.
 *
 * @example
 * const files = exportToQti({ identifier: 'exam1', title: 'Prova 1', items })
 * // files['imsmanifest.xml'], files['item_q001.xml'], ...
 */
export function exportToQti(manifest: QtiManifest): Record<string, string> {
  const files: Record<string, string> = {}
  const itemFilenames: string[] = []

  manifest.items.forEach((item, i) => {
    const fn = `item_${String(i + 1).padStart(4, '0')}.xml`
    itemFilenames.push(fn)
    files[fn] = `<?xml version="1.0" encoding="UTF-8"?>\n${itemToQti(item)}`
  })

  files['imsmanifest.xml'] = buildManifest(manifest, itemFilenames)

  return files
}

/**
 * Converte o Record de arquivos QTI para um único Blob ZIP (usando JSZip se disponível,
 * senão retorna o XML principal como text/xml).
 *
 * Em ambiente Next.js, usar esta função do lado do cliente onde JSZip pode ser importado.
 */
export async function exportToQtiZip(manifest: QtiManifest): Promise<Blob> {
  const files = exportToQti(manifest)

  try {
    // Tenta usar JSZip se disponível no bundle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSZip = (await import('jszip' as any)).default as any
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
      zip.file(name, content)
    }
    return await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
  } catch {
    // Fallback: exporta apenas o imsmanifest como XML
    return new Blob([files['imsmanifest.xml']], { type: 'application/xml' })
  }
}

/**
 * Trigger de download no browser.
 */
export function downloadQtiPackage(manifest: QtiManifest, filename = 'qti_export.xml'): void {
  const files = exportToQti(manifest)
  // Exporta manifest + primeiro item concatenado como fallback simples
  const content = Object.values(files).join('\n\n<!-- --- -->\n\n')
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
