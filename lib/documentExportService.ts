/**
 * lib/documentExportService.ts
 *
 * Exportação Oficial Fiel para Word (.doc) e PDF (Impressão Formatada)
 * de Planos de Desenvolvimento Individual (PDI), PEI e Projetos Pedagógicos.
 */

import { DocumentType } from './editableDocumentTypes'

export interface DocumentExportOptions {
  type: DocumentType
  title: string
  schoolName: string
  studentName?: string
  data: Record<string, any>
}

export function generateDocumentHtml(options: DocumentExportOptions): string {
  const { type, title, schoolName, studentName, data } = options
  const dateStr = new Date().toLocaleDateString('pt-BR')

  // ─── GERADOR DE HTML DO PDI ───────────────────────────────────────────────
  if (type === 'pdi') {
    const schoolInfo = data.schoolInfo || {}
    const studentInfo = data.studentInfo || {}
    const clinical = data.clinicalReport || {}
    const dev = data.developmentAssessment || {}
    const proposal = data.curricularProposal?.proposta || data.proposta || ''
    const skills = data.skillsMatrix || []
    const strategies = data.interventionPlan || []
    const signatures = data.signatures || []

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${title} — ${studentName || 'Estudante'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; padding: 0; }
          .header-box { border: 2pt solid #000; padding: 10pt; margin-bottom: 14pt; text-align: center; }
          .school-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4pt; }
          .doc-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 6pt; }
          .section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; background: #f0f0f0; border: 1pt solid #000; padding: 4pt 8pt; margin-top: 14pt; margin-bottom: 6pt; }
          .field-table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
          .field-table td { border: 1pt solid #000; padding: 4pt 8pt; font-size: 10.5pt; vertical-align: top; }
          .data-table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
          .data-table th, .data-table td { border: 1pt solid #000; padding: 5pt 6pt; text-align: left; vertical-align: top; }
          .data-table th { background-color: #e5e5e5; font-weight: bold; text-align: center; }
          .badge-hv { font-weight: bold; color: #006600; text-align: center; }
          .badge-hed { font-weight: bold; color: #996600; text-align: center; }
          .badge-hnv { font-weight: bold; color: #666666; text-align: center; }
          .legend-box { border: 1pt solid #000; padding: 4pt 8pt; font-size: 9pt; background: #f9f9f9; margin-top: 4pt; margin-bottom: 12pt; }
          .narrative-item { margin-bottom: 8pt; }
          .narrative-label { font-weight: bold; text-transform: uppercase; font-size: 10pt; }
          .signature-grid { width: 100%; border-collapse: collapse; margin-top: 24pt; page-break-inside: avoid; }
          .signature-cell { border: 1pt solid #000; padding: 12pt 8pt 6pt 8pt; text-align: center; width: 25%; vertical-align: bottom; }
          .signature-line { border-top: 1pt solid #000; margin: 24pt 10pt 4pt 10pt; }
          .signature-role { font-size: 9pt; font-weight: bold; text-transform: uppercase; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif; display:flex; justify-content:center; gap:12px; align-items:center;">
          <button onclick="window.print()" style="padding:10px 20px; background:#0284c7; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>

        <div style="padding: 10px;">
          <!-- 1. CABEÇALHO DA ESCOLA -->
          <div class="header-box">
            <div class="school-title">${(schoolInfo.schoolName || schoolName).toUpperCase()}</div>
            <div>${schoolInfo.city || 'Juiz de Fora - MG'} &bull; Data de Elaboração: ${schoolInfo.creationDate || dateStr}</div>
            <div class="doc-title">${title}</div>
          </div>

          <!-- 2. IDENTIFICAÇÃO DO ALUNO -->
          <div class="section-title">1. Identificação do Aluno</div>
          <table class="field-table">
            <tr>
              <td colspan="2"><strong>NOME COMPLETO:</strong> ${studentInfo.studentName || studentName || '____________________________________________________'}</td>
              <td><strong>NASCIMENTO:</strong> ${studentInfo.birthDate || '___/___/______'}</td>
            </tr>
            <tr>
              <td><strong>ANO / SÉRIE / CICLO:</strong> ${studentInfo.gradeCycle || 'Ensino Fundamental'}</td>
              <td colspan="2"><strong>FILIAÇÃO (PAI):</strong> ${studentInfo.fatherName || 'Não informado'}</td>
            </tr>
            <tr>
              <td colspan="3"><strong>FILIAÇÃO (MÃE / RESPONSÁVEL):</strong> ${studentInfo.motherName || 'Não informada'}</td>
            </tr>
          </table>

          <!-- 3. RELATÓRIO CIRCUNSTANCIADO -->
          <div class="section-title">2. Relatório Circunstanciado & Laudo Clínico</div>
          <table class="field-table">
            <tr>
              <td><strong>HÁ DIAGNÓSTICO CLÍNICO?</strong> ${clinical.hasClinicalDiagnosis ? 'SIM (X) NÃO ( )' : 'SIM ( ) NÃO (X)'}</td>
              <td><strong>CID-10:</strong> ${clinical.cid10 || 'Não aplicável'}</td>
              <td><strong>DATA DO LAUDO:</strong> ${clinical.reportDate || '___/___/______'}</td>
            </tr>
            <tr>
              <td colspan="2"><strong>PROFISSIONAL EMISSOR:</strong> ${clinical.professionalName || 'Não informado'}</td>
              <td><strong>MEDICAÇÃO:</strong> ${clinical.medication || 'Nenhuma informada'}</td>
            </tr>
            <tr>
              <td colspan="3"><strong>ACOMPANHAMENTOS ESPECIALIZADOS:</strong> ${clinical.specializedServices || 'Em acompanhamento pedagógico regular.'}</td>
            </tr>
          </table>

          <!-- 4. AVALIAÇÃO INICIAL DAS FUNÇÕES DE DESENVOLVIMENTO -->
          <div class="section-title">3. Avaliação Inicial das Funções de Desenvolvimento</div>
          <div style="border: 1pt solid #000; padding: 8pt; margin-bottom: 8pt;">
            <div class="narrative-item"><span class="narrative-label">A) Percepção:</span> ${dev.percepcao || 'Em observação.'}</div>
            <div class="narrative-item"><span class="narrative-label">B) Atenção:</span> ${dev.atencao || 'Em observação.'}</div>
            <div class="narrative-item"><span class="narrative-label">C) Memória:</span> ${dev.memoria || 'Em observação.'}</div>
            <div class="narrative-item"><span class="narrative-label">D) Linguagem:</span> ${dev.linguagem || 'Em observação.'}</div>
            <div class="narrative-item"><span class="narrative-label">E) Raciocínio Lógico-Matemático:</span> ${dev.raciocinio || 'Em observação.'}</div>
            <div class="narrative-item"><span class="narrative-label">F) Área Emocional-Afetiva-Social:</span> ${dev.emocional || 'Em observação.'}</div>
          </div>

          <!-- 5. PROPOSTA CURRICULAR -->
          <div class="section-title">4. Proposta Curricular Diferenciada</div>
          <div style="border: 1pt solid #000; padding: 8pt; margin-bottom: 8pt;">
            ${proposal || 'Proposta pedagógica voltada para desenvolvimento de autonomia e mediação nas etapas de aprendizagem.'}
          </div>

          <!-- 6. MATRIZ DE HABILIDADES BNCC -->
          <div class="section-title">5. Matriz de Habilidades BNCC Adaptadas</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 20%;">Disciplina</th>
                <th style="width: 25%;">Habilidade BNCC</th>
                <th style="width: 40%;">Como foi trabalhado</th>
                <th style="width: 15%;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${skills.length === 0 ? `
                <tr><td colspan="4" style="text-align:center; padding:10pt;">Nenhuma habilidade registrada.</td></tr>
              ` : skills.map((s: any) => `
                <tr>
                  <td><strong>${s.subject}</strong></td>
                  <td><strong>${s.skillCode}</strong><br/><small>${s.skillDescription || ''}</small></td>
                  <td>${s.workDoneOrAdaptedSkill || '-'}</td>
                  <td class="badge-${(s.status || 'HED').toLowerCase()}">${s.status || 'HED'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="legend-box">
            <strong>LEGENDA OFICIAL:</strong> <strong>HV:</strong> Habilidade Validada &bull; <strong>HED:</strong> Habilidade em Desenvolvimento &bull; <strong>HNV:</strong> Habilidade Não Validada
          </div>

          <!-- 7. PLANO DE INTERVENÇÃO -->
          <div class="section-title">6. Plano de Intervenção Pedagógica & AEE</div>
          <div style="border: 1pt solid #000; padding: 8pt; margin-bottom: 8pt;">
            <ul style="margin: 0; padding-left: 20pt;">
              ${strategies.filter((st: any) => st.isActive).map((st: any) => `
                <li style="margin-bottom: 4pt;">${st.description}</li>
              `).join('') || '<li>Estratégias pedagógicas e mediações individuais ativas.</li>'}
            </ul>
          </div>

          <!-- 8. TERMO DE ASSINATURA -->
          <div class="section-title">7. Termo de Ciência e Validação Multiprofissional</div>
          <table class="signature-grid">
            <tr>
              ${(signatures.length > 0 ? signatures : [
                { role: 'Direção Pedagógica', name: '' },
                { role: 'Professores Regentes', name: '' },
                { role: 'Coordenação Pedagógica', name: '' },
                { role: 'Orientação Educacional / AEE', name: '' }
              ]).map((sig: any) => `
                <td class="signature-cell">
                  <div>${sig.name || ''}</div>
                  <div class="signature-line"></div>
                  <div class="signature-role">${sig.role}</div>
                </td>
              `).join('')}
            </tr>
          </table>
        </div>
      </body>
      </html>
    `
  }

  // ─── GERADOR DE HTML DO PEI ───────────────────────────────────────────────
  if (type === 'pei') {
    const clinical = data.laudoInfo || data.clinicalReport || {}
    const goals = data.goals || []
    const accommodations = data.accommodations || []
    const flex = data.flexibilizacaoCurricular || []
    const aee = data.planoAee || {}
    const parecer = data.evolucaoLongitudinal?.parecer || data.generalObservations || ''

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${title} — ${studentName || 'Estudante'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; padding: 0; }
          .header-box { border: 2pt solid #000; padding: 10pt; margin-bottom: 14pt; text-align: center; }
          .school-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4pt; }
          .doc-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 6pt; }
          .section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; background: #f0f0f0; border: 1pt solid #000; padding: 4pt 8pt; margin-top: 14pt; margin-bottom: 6pt; }
          .field-table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
          .field-table td { border: 1pt solid #000; padding: 4pt 8pt; font-size: 10.5pt; vertical-align: top; }
          .data-table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
          .data-table th, .data-table td { border: 1pt solid #000; padding: 5pt 6pt; text-align: left; vertical-align: top; }
          .data-table th { background-color: #e5e5e5; font-weight: bold; text-align: center; }
          .signature-grid { width: 100%; border-collapse: collapse; margin-top: 24pt; page-break-inside: avoid; }
          .signature-cell { border: 1pt solid #000; padding: 12pt 8pt 6pt 8pt; text-align: center; width: 25%; vertical-align: bottom; }
          .signature-line { border-top: 1pt solid #000; margin: 24pt 10pt 4pt 10pt; }
          .signature-role { font-size: 9pt; font-weight: bold; text-transform: uppercase; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif; display:flex; justify-content:center; gap:12px; align-items:center;">
          <button onclick="window.print()" style="padding:10px 20px; background:#6d28d9; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
            🖨️ Imprimir / Salvar PDF
          </button>
        </div>

        <div style="padding: 10px;">
          <div class="header-box">
            <div class="school-title">${schoolName}</div>
            <div>Ano Letivo: ${new Date().getFullYear()} &bull; Data de Emissão: ${dateStr}</div>
            <div class="doc-title">${title}</div>
          </div>

          <div class="section-title">1. Identificação do Aluno & Diagnóstico</div>
          <table class="field-table">
            <tr>
              <td colspan="2"><strong>ESTUDANTE:</strong> ${studentName || data.studentName || '____________________________________________________'}</td>
              <td><strong>TURMA:</strong> ${data.gradeYear || data.className || 'Geral'}</td>
            </tr>
            <tr>
              <td><strong>DIAGNÓSTICO:</strong> ${data.diagnosis || 'Em avaliação'}</td>
              <td><strong>CID-10:</strong> ${clinical.cid10 || '-'}</td>
              <td><strong>PROFISSIONAL:</strong> ${clinical.issuedBy || '-'}</td>
            </tr>
          </table>

          <div class="section-title">2. Flexibilização Curricular (Habilidades BNCC)</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 30%;">Habilidade BNCC da Turma</th>
                <th style="width: 40%;">Habilidade Adaptada</th>
                <th style="width: 30%;">Critério de Êxito Diferenciado</th>
              </tr>
            </thead>
            <tbody>
              ${flex.length === 0 ? `
                <tr><td colspan="3" style="text-align:center; padding:10pt;">Nenhuma flexibilização curricular registrada.</td></tr>
              ` : flex.map((f: any) => `
                <tr>
                  <td><strong>${f.skillCode}</strong><br/><small>${f.skillDescription || ''}</small></td>
                  <td>${f.workDoneOrAdaptedSkill || '-'}</td>
                  <td>${f.criterion || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">3. Metas SMART Prioritárias</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 25%;">Meta</th>
                <th style="width: 25%;">Linha de Base</th>
                <th style="width: 25%;">Meta Alvo</th>
                <th style="width: 15%;">Prazo</th>
                <th style="width: 10%;">Progresso</th>
              </tr>
            </thead>
            <tbody>
              ${goals.map((g: any) => `
                <tr>
                  <td><strong>${g.title}</strong><br/><small>${g.category || ''}</small></td>
                  <td>${g.baseline || '-'}</td>
                  <td>${g.target || '-'}</td>
                  <td>${g.deadline || '-'}</td>
                  <td style="text-align:center;"><strong>${g.progressPct || 0}%</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">4. Acomodações Curriculares & AEE</div>
          <div style="border: 1pt solid #000; padding: 8pt; margin-bottom: 8pt;">
            <ul style="margin: 0; padding-left: 20pt;">
              ${accommodations.filter((a: any) => a.isActive).map((a: any) => `
                <li style="margin-bottom: 4pt;">${a.description}</li>
              `).join('') || '<li>Nenhuma acomodação especial selecionada.</li>'}
            </ul>
            ${aee.aeeObjectives ? `
              <div style="margin-top: 8pt; border-top: 1pt dashed #ccc; padding-top: 6pt;">
                <strong>AEE (${aee.aeeFrequency || 'Contraturno'}):</strong> ${aee.aeeObjectives}
              </div>
            ` : ''}
          </div>

          <div class="section-title">5. Parecer Evolutivo do Período</div>
          <div style="border: 1pt solid #000; padding: 8pt; margin-bottom: 8pt;">
            ${parecer || 'O estudante apresentou engajamento positivo com as acomodações propostas.'}
          </div>

          <div class="section-title">6. Validação e Assinaturas</div>
          <table class="signature-grid">
            <tr>
              <td class="signature-cell">
                <div class="signature-line"></div>
                <div class="signature-role">Professor(a) Regente</div>
              </td>
              <td class="signature-cell">
                <div class="signature-line"></div>
                <div class="signature-role">Professor(a) AEE</div>
              </td>
              <td class="signature-cell">
                <div class="signature-line"></div>
                <div class="signature-role">Coordenação Pedagógica</div>
              </td>
              <td class="signature-cell">
                <div class="signature-line"></div>
                <div class="signature-role">Responsável pelo Aluno</div>
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `
  }

  // ─── GERADOR DE HTML DE PROJETO ───────────────────────────────────────────
  const milestones = data.milestones || []
  const rubric = data.rubric || []
  const logs = data.progressLogs || []

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${title} — ${data.title || 'Projeto'}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; padding: 0; }
        .header-box { border: 2pt solid #000; padding: 10pt; margin-bottom: 14pt; text-align: center; }
        .school-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4pt; }
        .doc-title { font-size: 13pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 6pt; }
        .section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; background: #f0f0f0; border: 1pt solid #000; padding: 4pt 8pt; margin-top: 14pt; margin-bottom: 6pt; }
        .field-table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
        .field-table td { border: 1pt solid #000; padding: 4pt 8pt; font-size: 10.5pt; vertical-align: top; }
        .data-table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
        .data-table th, .data-table td { border: 1pt solid #000; padding: 5pt 6pt; text-align: left; vertical-align: top; }
        .data-table th { background-color: #e5e5e5; font-weight: bold; text-align: center; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#f5f0e8; padding:12px; text-align:center; border-bottom:1px solid #ccc; font-family:sans-serif; display:flex; justify-content:center; gap:12px; align-items:center;">
        <button onclick="window.print()" style="padding:10px 20px; background:#8b5e3c; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      <div style="padding: 10px;">
        <div class="header-box">
          <div class="school-title">${schoolName}</div>
          <div>Duração: ${data.durationWeeks || 6} Semanas &bull; Período: ${data.startDate || dateStr} a ${data.endDate || '-'}</div>
          <div class="doc-title">${data.title || title}</div>
        </div>

        <div class="section-title">1. Dados e Pergunta Norteadora (Driving Question)</div>
        <table class="field-table">
          <tr>
            <td><strong>DISCIPLINAS:</strong> ${Array.isArray(data.subjects) ? data.subjects.join(', ') : data.subjects || '-'}</td>
            <td><strong>TURMAS:</strong> ${Array.isArray(data.classes) ? data.classes.join(', ') : data.classes || '-'}</td>
          </tr>
          <tr>
            <td colspan="2"><strong>PERGUNTA NORTEADORA:</strong> ${data.drivingQuestion || '-'}</td>
          </tr>
          <tr>
            <td colspan="2"><strong>PRODUTO FINAL ESPERADO:</strong> ${data.finalProduct || '-'}</td>
          </tr>
        </table>

        <div class="section-title">2. Cronograma de Marcos & Entregáveis (Milestones)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 35%;">Marco</th>
              <th style="width: 20%;">Data Prevista</th>
              <th style="width: 30%;">Entregável</th>
              <th style="width: 15%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${milestones.map((m: any) => `
              <tr>
                <td><strong>${m.title}</strong></td>
                <td>${m.expectedDate || '-'}</td>
                <td>${m.deliverable || '-'}</td>
                <td style="text-align:center; font-weight:bold;">${m.status.toUpperCase()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">3. Rubrica Avaliativa do Projeto</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 25%;">Critério & Peso</th>
              <th style="width: 25%;">1. Insuficiente</th>
              <th style="width: 25%;">2. Adequado</th>
              <th style="width: 25%;">3. Avançado</th>
            </tr>
          </thead>
          <tbody>
            ${rubric.map((r: any) => `
              <tr>
                <td><strong>${r.name}</strong><br/><small>Peso: ${r.weight}%</small></td>
                <td>${r.levels?.[0]?.description || '-'}</td>
                <td>${r.levels?.[1]?.description || '-'}</td>
                <td>${r.levels?.[2]?.description || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${logs.length > 0 ? `
          <div class="section-title">4. Registros de Acompanhamento (Diário de Bordo)</div>
          <div style="border: 1pt solid #000; padding: 8pt;">
            ${logs.map((l: any) => `
              <div style="margin-bottom: 8pt; border-bottom: 1pt dashed #ccc; padding-bottom: 6pt;">
                <strong>${l.date} &bull; ${l.author}:</strong> ${l.notes}
                ${l.nextSteps ? `<br/><small><em>Próximos passos: ${l.nextSteps}</em></small>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `
}

export function exportDocumentToWord(options: DocumentExportOptions) {
  const html = generateDocumentHtml(options)
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword'
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = (options.studentName || options.data.title || options.title)
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_')
  a.download = `${options.type.toUpperCase()}_${safeName}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportDocumentToPdf(options: DocumentExportOptions) {
  const html = generateDocumentHtml(options)
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(html)
  printWindow.document.close()
}
