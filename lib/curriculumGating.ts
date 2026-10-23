/**
 * lib/curriculumGating.ts — Pacote 9 & Seções 12, 13, 14 e 23 do Parecer Técnico
 *
 * Implementa:
 * 1. Esquema formal GatingRule ancorado em códigos oficiais da BNCC ou tradição curricular.
 * 2. Arquitetura em Duas Camadas: Camada BNCC (oficial) e Camada Rede/Escola (configurável).
 * 3. Severidades graduadas: 'AVISO' (fora do ano na BNCC, permite prosseguir com justificativa),
 *    'SUGESTAO' (ponte para o ano seguinte), 'BLOQUEIO' (apenas erro factual ou risco de segurança).
 * 4. Registro auditável de Override (quem, quando, por quê) e sinalização automática de regras suspeitas (>= 3 overrides).
 * 5. Configuração do Ensino Médio (Lei 14.945/2024): 'tradicional' (padrão por série) vs. 'competencia' (por área EM13).
 * 6. Governança de Temas Transversais, Leis 10.639/2003 e 11.645/2008, e Assuntos Sensíveis/Contestados.
 */

import { getBnccSkillByCode, normalizeBnccSubjectKey } from './bnccStore'

export type GatingSeverity = 'AVISO' | 'SUGESTAO' | 'BLOQUEIO'
export type GatingProvenance = 'BNCC-VERIF' | 'BNCC-CONFERIR' | 'SINTESE-TA'
export type GatingValidationStatus = 'PENDENTE' | 'PROFESSOR-OK'
export type CurriculumScopeLayer = 'bncc' | 'rede_escola'
export type EnsinoMedioSequenceMode = 'tradicional' | 'competencia'
export type SensitiveTopicsPolicy = 'plural_documental' | 'restrito_confirmacao'

export interface GatingRule {
  id: string            // ex.: 'MAT-G-9-004'
  subject: string       // 'portuguese' | 'math' | 'history' | 'geography' | 'physics' | 'chemistry' | 'biology' | 'science'
  stage: 'EF' | 'EM'
  grade: string         // '6' | '7' | '8' | '9' | '6-7' | '8-9' | '1a_serie' | '2a_serie' | '3a_serie'
  anchor: { type: 'bncc'; code: string } | { type: 'tradition'; note: string }
  rule: string
  /** Palavras-chave de tópicos pertencentes a séries posteriores que acionam aviso nesta série */
  outOfGradeTopics?: string[]
  /** Tópicos permitidos como ponte pedagógica ('SUGESTAO') */
  bridgeTopics?: string[]
  severity: GatingSeverity
  source: string
  provenance: GatingProvenance
  validation: GatingValidationStatus
}

export interface GatingOverrideRecord {
  id: string
  ruleId: string
  subject: string
  grade: string
  topic: string
  who: string
  when: string
  reason: string
  previousSeverity: GatingSeverity
}

export interface CurriculumProfileConfig {
  activeLayer: CurriculumScopeLayer
  defaultBnccSeverity: 'AVISO' | 'BLOQUEIO'
  emSequenceMode: EnsinoMedioSequenceMode
  sensitiveTopicsPolicy: SensitiveTopicsPolicy
  schoolCustomRules: GatingRule[]
}

const CONFIG_STORAGE_KEY = 'teacher_curriculum_profile_config_v2'
const OVERRIDE_STORAGE_KEY = 'teacher_gating_overrides_v2'

let memoryOverrides: GatingOverrideRecord[] = []
let memoryConfig: CurriculumProfileConfig = {
  activeLayer: 'bncc',
  defaultBnccSeverity: 'AVISO',          // Decisão A2 do dono
  emSequenceMode: 'tradicional',         // Decisão A1 do dono
  sensitiveTopicsPolicy: 'plural_documental', // Decisão A4 do dono
  schoolCustomRules: []
}

// ─── Catálogo Oficial de Regras de Gating (Seções 13 e 14) ──────────────────

export const GATING_RULES_CATALOG: GatingRule[] = [
  // ─── 1. LÍNGUA PORTUGUESA (Bloco BNCC + Progressão Anual [SÍNTESE-TA]) ─────
  {
    id: 'LP-G-6-001',
    subject: 'portuguese',
    stage: 'EF',
    grade: '6',
    anchor: { type: 'bncc', code: 'EF06LP01' },
    rule: '6º Ano EF (Bloco 6º-7º): Textos de 100 a 220 palavras. Foco em narrativas (conto, fábula, relato), notícia, tirinha, classes de palavras básicas (substantivo, adjetivo, verbo) e variação linguística. Evitar período composto por subordinação, regência abstrata e dissertação modelo ENEM.',
    outOfGradeTopics: ['orações subordinadas', 'oração subordinada', 'dissertação modelo enem', 'redação enem', 'mesóclise', 'regência nominal complexa'],
    bridgeTopics: ['conectivos básicos de causa e tempo'],
    severity: 'AVISO',
    source: 'MEC BNCC Língua Portuguesa EF (p. 87-158) — EF06LP01 a EF06LP12 / EF67LP',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'LP-G-7-001',
    subject: 'portuguese',
    stage: 'EF',
    grade: '7',
    anchor: { type: 'bncc', code: 'EF07LP04' },
    rule: '7º Ano EF (Bloco 6º-7º): Textos de 180 a 320 palavras. Foco em crônica, notícia vs. reportagem, transitividade verbal (VTD, VTI, VL), sujeito/predicado e concordância básica (`EF07LP04` a `EF07LP14`). Evitar orações reduzidas e mesóclise.',
    outOfGradeTopics: ['orações reduzidas', 'oração reduzida de gerúndio', 'mesóclise', 'dissertação enem 5 competências'],
    severity: 'AVISO',
    source: 'MEC BNCC Língua Portuguesa EF — EF07LP04 a EF07LP14 / EF67LP',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'LP-G-8-001',
    subject: 'portuguese',
    stage: 'EF',
    grade: '8',
    anchor: { type: 'bncc', code: 'EF08LP08' },
    rule: '8º Ano EF (Bloco 8º-9º): Textos de 250 a 420 palavras. Artigo de opinião, vozes verbais (ativa, passiva analítica e sintética — `EF08LP08`), adjuntos adnominais (`EF08LP09`), coordenação e subordinação substantiva/adverbial (`EF08LP11` a `EF08LP13`).',
    outOfGradeTopics: ['trovadorismo', 'quinhentismo', 'barroco literário', 'vanguardas europeias'],
    severity: 'AVISO',
    source: 'MEC BNCC Língua Portuguesa EF — EF08LP08, EF08LP09, EF08LP11 a EF08LP16',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'LP-G-9-001',
    subject: 'portuguese',
    stage: 'EF',
    grade: '9',
    anchor: { type: 'bncc', code: 'EF09LP09' },
    rule: '9º Ano EF (Bloco 8º-9º): Textos de 300 a 550 palavras. Dissertação-argumentativa, orações subordinadas adjetivas restritivas vs. explicativas (`EF09LP09`), regência verbal/nominal (`EF09LP07`), colocação pronominal (`EF09LP10`) e operadores argumentativos (`EF09LP08`).',
    severity: 'AVISO',
    source: 'MEC BNCC Língua Portuguesa EF — EF09LP07 a EF09LP12 / EF89LP',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'LP-G-EM-001',
    subject: 'portuguese',
    stage: 'EM',
    grade: '1a_serie',
    anchor: { type: 'bncc', code: 'EM13LP01' },
    rule: 'Ensino Médio LP: Textos de 400 a 800 palavras + coletânea multimodal. Escolas literárias, funções da linguagem, variação linguística (`EM13LP10`), modalização (`EM13LP07`) e dissertação-argumentativa padrão ENEM.',
    severity: 'AVISO',
    source: 'MEC BNCC Ensino Médio Linguagens — EM13LP01 a EM13LP52 / Lei 14.945/2024',
    provenance: 'SINTESE-TA',
    validation: 'PENDENTE'
  },

  // ─── 2. MATEMÁTICA (Seção 13 Corrigida) ─────────────────────────────────────
  {
    id: 'MAT-G-6-001',
    subject: 'math',
    stage: 'EF',
    grade: '6',
    anchor: { type: 'bncc', code: 'EF06MA01' },
    rule: '6º Ano EF: Números naturais, racionais positivos (frações e decimais), porcentagem básica, perímetro e área em malha. Números inteiros negativos pertencem ao 7º ano (`EF07MA03`).',
    outOfGradeTopics: ['números inteiros negativos', 'operações com negativos', 'bhaskara', 'equação do 2º grau', 'logaritmo', 'matrizes'],
    severity: 'AVISO',
    source: 'MEC BNCC Matemática EF — EF06MA01 a EF06MA34',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'MAT-G-7-001',
    subject: 'math',
    stage: 'EF',
    grade: '7',
    anchor: { type: 'bncc', code: 'EF07MA03' },
    rule: '7º Ano EF: Formalização dos números inteiros negativos (`EF07MA03`, `EF07MA04`), equações polinomiais de 1º grau do tipo ax + b = c (`EF07MA18`), razão, proporção e ângulos. Equações de 2º grau e Teorema de Pitágoras pertencem a séries posteriores.',
    outOfGradeTopics: ['fórmula de bhaskara', 'teorema de pitágoras', 'trigonometria', 'função quadrática', 'produtos notáveis'],
    severity: 'AVISO',
    source: 'MEC BNCC Matemática EF — EF07MA03, EF07MA04, EF07MA18',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'MAT-G-8-001',
    subject: 'math',
    stage: 'EF',
    grade: '8',
    anchor: { type: 'bncc', code: 'EF08MA09' },
    rule: '8º Ano EF: Potenciação, notação científica, valor numérico de expressões (`EF08MA06`), sistemas lineares 2x2 (`EF08MA08`) e equações do 2º grau incompletas do tipo ax² = b (`EF08MA09`). ATENÇÃO: Fatoração algébrica e produtos notáveis associados a equações de 2º grau completas são do 9º ano (`EF09MA09`); no 8º ano permite-se apenas visualização geométrica de (a+b)² como ponte (`SUGESTAO`).',
    outOfGradeTopics: ['fatoração de trinômio', 'produtos notáveis algébricos', 'fórmula de bhaskara', 'trigonometria no triângulo retângulo', 'logaritmos'],
    bridgeTopics: ['visualização geométrica da área de (a+b)²'],
    severity: 'AVISO',
    source: 'MEC BNCC Matemática EF — EF08MA06, EF08MA08, EF08MA09 vs. EF09MA09',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'MAT-G-9-004',
    subject: 'math',
    stage: 'EF',
    grade: '9',
    anchor: { type: 'bncc', code: 'EF09MA09' },
    rule: '9º Ano EF: Processos de fatoração de expressões algébricas e produtos notáveis para resolução de equações do 2º grau (`EF09MA09`), conceito de função (`EF09MA06`), Teorema de Tales e Teorema de Pitágoras / relações métricas (`EF09MA13`).',
    outOfGradeTopics: ['números complexos', 'matrizes e determinantes', 'geometria analítica de cônicas', 'derivadas'],
    severity: 'AVISO',
    source: 'MEC BNCC Matemática EF — EF09MA06, EF09MA09, EF09MA13',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'MAT-G-EM-001',
    subject: 'math',
    stage: 'EM',
    grade: '1a_serie',
    anchor: { type: 'bncc', code: 'EM13MAT302' },
    rule: 'Ensino Médio Matemática (Perfil Tradicional [SÍNTESE-TA]): 1ª série (Funções Afim, Quadrática, Exponencial, Logarítmica, PA/PG — `EM13MAT302` a `305`, `507` e `508`); 2ª série (Trigonometria, Matrizes, Sistemas, Combinatória, Probabilidade e Geometria Espacial — `EM13MAT301`, `306` a `311`); 3ª série (Geometria Analítica, Estatística e Dispersão — `EM13MAT316`, `510`).',
    severity: 'AVISO',
    source: 'MEC BNCC Ensino Médio Matemática — EM13MAT101 a EM13MAT510 / Lei 14.945/2024',
    provenance: 'SINTESE-TA',
    validation: 'PENDENTE'
  },

  // ─── 3. HISTÓRIA (Seção 14.1 + Leis 10.639/2003 e 11.645/2008) ──────────────
  {
    id: 'HIS-G-6-001',
    subject: 'history',
    stage: 'EF',
    grade: '6',
    anchor: { type: 'bncc', code: 'EF06HI08' },
    rule: '6º Ano EF: Tempo histórico e fontes (`EF06HI01`-`02`), hominização e povoamento da América (`EF06HI03`-`06`), Antiguidade Oriental, Africana e Pré-Colombiana/Indígena (`EF06HI07`-`08`), Grécia e Roma (`EF06HI09`-`13`) e Idade Média/Feudalismo (`EF06HI14`-`19`). Fora do ano: Iluminismo, Era Vargas, Guerra Fria.',
    outOfGradeTopics: ['iluminismo', 'revolução industrial', 'era vargas', 'guerra fria', 'ditadura militar'],
    severity: 'AVISO',
    source: 'MEC BNCC História EF — EF06HI01 a EF06HI19',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'HIS-G-7-001',
    subject: 'history',
    stage: 'EF',
    grade: '7',
    anchor: { type: 'bncc', code: 'EF07HI09' },
    rule: '7º Ano EF: Modernidade, Renascimento e Reformas (`EF07HI01`, `04`-`05`), Reinos Africanos e Povos Americanos pré-expansão (`EF07HI02`-`03`), Monarquias Nacionais (`EF07HI07`), Conquista da América e resistências indígenas/africanas (`EF07HI08`-`09`), América Portuguesa e escravidão transatlântica (`EF07HI10`-`16`). Fora do ano: Era Vargas, Guerra Fria.',
    outOfGradeTopics: ['era vargas', 'guerra fria', 'primeira guerra mundial', 'crise de 1929'],
    severity: 'AVISO',
    source: 'MEC BNCC História EF — EF07HI01 a EF07HI17',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'HIS-G-8-001',
    subject: 'history',
    stage: 'EF',
    grade: '8',
    anchor: { type: 'bncc', code: 'EF08HI04' },
    rule: '8º Ano EF: Iluminismo (`EF08HI01`), Revoluções Inglesas e Industrial (`EF08HI02`-`03`), Revolução Francesa (`EF08HI04`), Independências na América/Haiti/Brasil (`EF08HI05`-`14`), Primeiro Reinado, Regências e Segundo Reinado (`EF08HI15`-`22`), Imperialismo no séc. XIX (`EF08HI23`-`26`).',
    outOfGradeTopics: ['guerra fria', 'era vargas', 'redemocratização de 1985'],
    severity: 'AVISO',
    source: 'MEC BNCC História EF — EF08HI01 a EF08HI27',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'HIS-G-9-001',
    subject: 'history',
    stage: 'EF',
    grade: '9',
    anchor: { type: 'bncc', code: 'EF09HI12' },
    rule: '9º Ano EF: Primeira República e Era Vargas (`EF09HI01`-`09`), protagonismo afro-brasileiro e indígena no séc. XX (`EF09HI07`-`08`), 1ª Guerra e Revolução Russa (`EF09HI10`-`11`), Crise de 1929 e Totalitarismos (`EF09HI12`-`13`), Ditadura Civil-Militar e Constituição de 1988 (`EF09HI19`-`27`), Guerra Fria e Globalização (`EF09HI28`-`36`).',
    outOfGradeTopics: ['antiguidade clássica aprofundada', 'feudalismo medieval'],
    severity: 'AVISO',
    source: 'MEC BNCC História EF — EF09HI01 a EF09HI36',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },

  // ─── 4. GEOGRAFIA (Seção 14.2) ──────────────────────────────────────────────
  {
    id: 'GEO-G-6-001',
    subject: 'geography',
    stage: 'EF',
    grade: '6',
    anchor: { type: 'bncc', code: 'EF06GE08' },
    rule: '6º Ano EF: Identidade sociocultural e Lugar (`EF06GE01`-`02`), Movimentos da Terra e Clima (`EF06GE03`-`05`), Escala Cartográfica (`EF06GE08`), Blocos-Diagrama e Perfis Topográficos (`EF06GE09`), Ciclo Hidrológico e Ilhas de Calor (`EF06GE04`, `EF06GE13`).',
    outOfGradeTopics: ['blocos econômicos', 'guerra fria geopolítica', 'industrialização asiática'],
    severity: 'AVISO',
    source: 'MEC BNCC Geografia EF — EF06GE01 a EF06GE13',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'GEO-G-7-001',
    subject: 'geography',
    stage: 'EF',
    grade: '7',
    anchor: { type: 'bncc', code: 'EF07GE01' },
    rule: '7º Ano EF: Formação Territorial e Regionalização do Brasil (`EF07GE01`-`02`), Povos Indígenas e Quilombolas (`EF07GE03`), População, Industrialização, Espaço Agrário e Transportes no Brasil (`EF07GE04`-`08`), Domínios Morfoclimáticos (`EF07GE11`).',
    severity: 'AVISO',
    source: 'MEC BNCC Geografia EF — EF07GE01 a EF07GE12',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'GEO-G-8-001',
    subject: 'geography',
    stage: 'EF',
    grade: '8',
    anchor: { type: 'bncc', code: 'EF08GE05' },
    rule: '8º Ano EF: Fluxos Migratórios e Demografia Mundial (`EF08GE01`-`04`), Conceitos de Estado, Nação, Território, Governo e País (`EF08GE05`), Geopolítica e Espaço Urbano/Agrário na América Latina e África (`EF08GE06`-`24`).',
    severity: 'AVISO',
    source: 'MEC BNCC Geografia EF — EF08GE01 a EF08GE24',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'GEO-G-9-001',
    subject: 'geography',
    stage: 'EF',
    grade: '9',
    anchor: { type: 'bncc', code: 'EF09GE10' },
    rule: '9º Ano EF: Hegemonia Europeia, Globalização e Multipolaridade (`EF09GE01`-`06`), Industrialização e Geopolítica na Europa, Ásia e Oceania (`EF09GE10`-`13`), Projeções Cartográficas (`EF09GE14`).',
    severity: 'AVISO',
    source: 'MEC BNCC Geografia EF — EF09GE01 a EF09GE18',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },

  // ─── 5. CIÊNCIAS DO ENSINO FUNDAMENTAL E SUBDISCIPLINAS (Seção 14.3) ────────
  {
    id: 'CIE-G-6-001',
    subject: 'science',
    stage: 'EF',
    grade: '6',
    anchor: { type: 'bncc', code: 'EF06CI01' },
    rule: '6º Ano EF Ciências (Matéria/Energia, Vida/Evolução, Terra/Universo): Misturas e separação (`EF06CI01`-`04`), Célula como unidade da vida e sistemas nervoso/locomotor/visão (`EF06CI05`-`10`), Camadas e esfericidade da Terra (`EF06CI11`-`14`). Fora do escopo do EF: cálculo estequiométrico em mol, distribuição de Pauling/Madelung, equações horárias de MRUV.',
    outOfGradeTopics: ['cálculo estequiométrico em mol', 'reagente limitante', 'diagrama de pauling', 'mruv', 'ciclo de krebs'],
    severity: 'AVISO',
    source: 'MEC BNCC Ciências EF — EF06CI01 a EF06CI14',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'CIE-G-7-001',
    subject: 'science',
    stage: 'EF',
    grade: '7',
    anchor: { type: 'bncc', code: 'EF07CI02' },
    rule: '7º Ano EF Ciências: Máquinas simples, temperatura vs. calor, propagação térmica e máquinas térmicas (`EF07CI01`-`06`), Ecossistemas brasileiros, saúde pública e vacinação (`EF07CI07`-`11`), Composição do ar, efeito estufa, camada de ozônio e placas tectônicas (`EF07CI12`-`16`).',
    outOfGradeTopics: ['ciclo de carnot quantitativo', 'equação de clapeyron', 'reagente limitante', 'segunda lei de mendel'],
    severity: 'AVISO',
    source: 'MEC BNCC Ciências EF — EF07CI01 a EF07CI16',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'CIE-G-8-001',
    subject: 'science',
    stage: 'EF',
    grade: '8',
    anchor: { type: 'bncc', code: 'EF08CI13' },
    rule: '8º Ano EF Ciências: Fontes de energia, circuitos elétricos simples e consumo em kWh (`EF08CI01`-`06`), Reprodução, puberdade, métodos contraceptivos e ISTs (`EF08CI07`-`11`), Fases da Lua, eclipses, estações do ano pela inclinação do eixo terrestre (`EF08CI13`) e clima (`EF08CI12`-`16`).',
    outOfGradeTopics: ['leis de kirchhoff', 'indução de faraday quantitativa', 'engenharia genética pcr'],
    severity: 'AVISO',
    source: 'MEC BNCC Ciências EF — EF08CI01 a EF08CI16',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },
  {
    id: 'CIE-G-9-001',
    subject: 'science',
    stage: 'EF',
    grade: '9',
    anchor: { type: 'bncc', code: 'EF09CI01' },
    rule: '9º Ano EF Ciências: Mudanças de estado pelo modelo submicroscópico (`EF09CI01`), proporção de massas e balanceamento básico (`EF09CI02`), modelos atômicos (`EF09CI03`), cores e ondas eletromagnéticas (`EF09CI04`-`07`), Genética mendeliana (`EF09CI08`-`09`), Lamarck vs. Darwin (`EF09CI10`-`11`) e Sistema Solar/Evolução estelar (`EF09CI14`-`17`).',
    outOfGradeTopics: ['cálculo de pH logarítmico', 'equilíbrio iônico kc kp', 'química orgânica nomenclatura iupac avançada', 'relatividade restrita'],
    severity: 'AVISO',
    source: 'MEC BNCC Ciências EF — EF09CI01 a EF09CI17',
    provenance: 'BNCC-VERIF',
    validation: 'PENDENTE'
  },

  // ─── 6. FÍSICA, QUÍMICA E BIOLOGIA NO ENSINO MÉDIO (Seção 14.4) ─────────────
  {
    id: 'FIS-G-EM-001',
    subject: 'physics',
    stage: 'EM',
    grade: '1a_serie',
    anchor: { type: 'bncc', code: 'EM13CNT204' },
    rule: 'Ensino Médio Física (Perfil Tradicional [SÍNTESE-TA]): 1ª série (Cinemática escalar/vetorial, Leis de Newton, Trabalho, Energia, Impulso, Gravitação e Hidrostática — `EM13CNT101`, `EM13CNT204`); 2ª série (Termologia, Termodinâmica, Óptica e Ondulatória — `EM13CNT102`); 3ª série (Eletrostática, Eletrodinâmica, Eletromagnetismo e Física Moderna — `EM13CNT103`, `106`, `107`).',
    severity: 'AVISO',
    source: 'MEC BNCC Ensino Médio CNT — EM13CNT101 a EM13CNT302 / Lei 14.945/2024',
    provenance: 'SINTESE-TA',
    validation: 'PENDENTE'
  },
  {
    id: 'QUI-G-EM-001',
    subject: 'chemistry',
    stage: 'EM',
    grade: '1a_serie',
    anchor: { type: 'bncc', code: 'EM13CNT307' },
    rule: 'Ensino Médio Química (Perfil Tradicional [SÍNTESE-TA]): 1ª série (Propriedades da matéria, Modelos Atômicos, Regra de Madelung/Pauling, Tabela Periódica, Ligações Químicas, Geometria/Polaridade e Funções Inorgânicas — `EM13CNT307`); 2ª série (Grandezas Químicas/Mol, Estequiometria, Soluções, Termoquímica e Cinética — `EM13CNT101`, `104`); 3ª série (Equilíbrio Químico/pH, Eletroquímica, Radioatividade e Química Orgânica — `EM13CNT105`, `107`).',
    severity: 'AVISO',
    source: 'MEC BNCC Ensino Médio CNT — EM13CNT101 a EM13CNT307 / Lei 14.945/2024',
    provenance: 'SINTESE-TA',
    validation: 'PENDENTE'
  },
  {
    id: 'BIO-G-EM-001',
    subject: 'biology',
    stage: 'EM',
    grade: '1a_serie',
    anchor: { type: 'bncc', code: 'EM13CNT202' },
    rule: 'Ensino Médio Biologia (Perfil Tradicional [SÍNTESE-TA]): 1ª série (Bioquímica, Citologia, Transporte em Membrana, Metabolismo Energético e Divisão Celular — `EM13CNT202`); 2ª série (Microbiologia, Saúde Pública, Botânica, Zoologia e Fisiologia Humana — `EM13CNT207`, `310`); 3ª série (Genética, Biotecnologia, Evolução Filogenética e Ecologia — `EM13CNT201`, `203`, `205`, `206`, `208`, `304`).',
    severity: 'AVISO',
    source: 'MEC BNCC Ensino Médio CNT — EM13CNT201 a EM13CNT310 / Lei 14.945/2024',
    provenance: 'SINTESE-TA',
    validation: 'PENDENTE'
  }
]

// ─── Funções de Gestão do Perfil Curricular e Overrides ──────────────────────

export function getCurriculumProfileConfig(): CurriculumProfileConfig {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (raw) {
        memoryConfig = { ...memoryConfig, ...JSON.parse(raw) }
      }
    } catch { /* ignore */ }
  }
  return memoryConfig
}

export function saveCurriculumProfileConfig(partial: Partial<CurriculumProfileConfig>): CurriculumProfileConfig {
  memoryConfig = { ...getCurriculumProfileConfig(), ...partial }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(memoryConfig))
    } catch { /* ignore */ }
  }
  return memoryConfig
}

/**
 * Registra um override auditável quando a professora opta por prosseguir diante de um AVISO de gating (Seção 12).
 */
export function recordGatingOverride(params: {
  ruleId: string
  subject: string
  grade: string
  topic: string
  who: string
  reason: string
  previousSeverity?: GatingSeverity
}): GatingOverrideRecord {
  const record: GatingOverrideRecord = {
    id: `ovr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ruleId: params.ruleId,
    subject: normalizeBnccSubjectKey(params.subject),
    grade: params.grade,
    topic: params.topic,
    who: params.who.trim() || 'teacher_default',
    when: new Date().toISOString(),
    reason: params.reason.trim() || 'Antecipação curricular da escola/rede',
    previousSeverity: params.previousSeverity || 'AVISO'
  }

  const all = getGatingOverrides()
  all.push(record)
  memoryOverrides = all

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(all))
    } catch { /* ignore */ }
  }
  return record
}

export function getGatingOverrides(ruleId?: string): GatingOverrideRecord[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(OVERRIDE_STORAGE_KEY)
      if (raw) memoryOverrides = JSON.parse(raw)
    } catch { /* ignore */ }
  }
  if (!ruleId) return [...memoryOverrides]
  return memoryOverrides.filter(o => o.ruleId === ruleId)
}

export function clearGatingOverridesForTest(): void {
  memoryOverrides = []
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(OVERRIDE_STORAGE_KEY)
      localStorage.removeItem(CONFIG_STORAGE_KEY)
    } catch { /* ignore */ }
  }
}

/**
 * Verifica se todas as regras com âncora BNCC apontam para códigos reais no catálogo oficial (Critério de Aceite Pacote 0).
 */
export function verifyAllGatingRuleAnchors(): {
  valid: boolean
  totalRules: number
  orphanRuleIds: string[]
} {
  const orphanRuleIds: string[] = []
  for (const rule of GATING_RULES_CATALOG) {
    if (rule.anchor.type === 'bncc') {
      const skill = getBnccSkillByCode(rule.anchor.code)
      if (!skill) {
        orphanRuleIds.push(`${rule.id}:${rule.anchor.code}`)
      }
    }
  }
  return {
    valid: orphanRuleIds.length === 0,
    totalRules: GATING_RULES_CATALOG.length,
    orphanRuleIds
  }
}

export interface TopicGatingEvaluation {
  status: 'OK' | 'AVISO' | 'SUGESTAO' | 'BLOQUEIO'
  canProceedWithJustification: boolean
  matchedRule?: GatingRule
  message: string
  suspectRuleForReview: boolean
  transversalDirectives: string[]
}

const UNSAFE_SCIENCE_PATTERNS = /síntese de explosivo|cloro gasoso caseiro|misturar água sanitária com amônia|misturar água sanitária e vinagre fechado|bomba caseira|produção de veneno|termite caseira/i

/**
 * Avalia se um tópico proposto está alinhado com a série na camada ativa (BNCC ou Rede/Escola)
 * e injeta diretrizes obrigatórias de Temas Transversais / Leis 10.639 e 11.645 / Segurança (Seções 12 e 23).
 */
export function evaluateTopicGating(params: {
  subject: string
  gradeYear: string
  topic: string
}): TopicGatingEvaluation {
  const normSubj = normalizeBnccSubjectKey(params.subject)
  const tLower = (params.topic || '').toLowerCase().trim()
  const gLower = (params.gradeYear || '').toLowerCase().trim()
  const config = getCurriculumProfileConfig()

  // 1. BLOQUEIO estrito para conteúdo inseguro de laboratório/química (Seção 12 e 21)
  if (UNSAFE_SCIENCE_PATTERNS.test(tLower)) {
    return {
      status: 'BLOQUEIO',
      canProceedWithJustification: false,
      message: 'BLOQUEIO DE SEGURANÇA: O procedimento solicitado envolve síntese ou mistura química perigosa/tóxica inadequada para ambiente escolar.',
      suspectRuleForReview: false,
      transversalDirectives: []
    }
  }

  // Determina a série canônica ('6', '7', '8', '9', '1a_serie')
  const isMedio = gLower.includes('médio') || gLower.includes('medio') || gLower === 'em' || gLower.includes('série') || gLower.includes('serie')
  let gradeKey = '8'
  if (isMedio) gradeKey = '1a_serie'
  else if (gLower.includes('6')) gradeKey = '6'
  else if (gLower.includes('7')) gradeKey = '7'
  else if (gLower.includes('8')) gradeKey = '8'
  else if (gLower.includes('9')) gradeKey = '9'

  // Para Física, Química e Biologia no Ensino Fundamental (6º ao 9º), aplica também as regras de Ciências EF
  const candidateSubjects = (!isMedio && ['physics', 'chemistry', 'biology'].includes(normSubj))
    ? [normSubj, 'science']
    : [normSubj]

  const allRules = [...config.schoolCustomRules, ...GATING_RULES_CATALOG]
  const matchingRule = allRules.find(
    r => candidateSubjects.includes(r.subject) && r.grade === gradeKey
  )

  const transversalDirectives: string[] = []

  // Leis 10.639/2003 e 11.645/2008 em História, Geografia e Literatura/LP (Seção 14.1 e 23)
  if (['history', 'geography', 'portuguese'].includes(normSubj)) {
    transversalDirectives.push(
      '[CONFORMIDADE LEGAL — LEIS 10.639/2003 E 11.645/2008]: Garanta visibilidade ativa, agência histórica e protagonismo de sujeitos indígenas e afro-brasileiros, proibindo retratá-los como passivos ou homogêneos.'
    )
  }

  // Temas sensíveis ou politicamente contestados (Seção 23 — Decisão A4: Abordagem Plural e Documental)
  if (/ditadura|golpe|regime militar|sexualidade|contraceptiv|religi|ações afirmativas|cotas|reforma agrária/i.test(tLower)) {
    transversalDirectives.push(
      '[DIRETRIZ DE TEMAS SENSÍVEIS E CONTESTADOS — SEÇÃO 23]: Adote abordagem estritamente factual, documental e plural, adequada à faixa etária da série na BNCC, citando fontes primárias/historiográficas e apresentando interpretações em disputa sem induzir posição partidária.'
    )
  }

  if (!matchingRule) {
    return {
      status: 'OK',
      canProceedWithJustification: true,
      message: 'Tópico dentro do escopo esperado.',
      suspectRuleForReview: false,
      transversalDirectives
    }
  }

  const overridesCount = getGatingOverrides(matchingRule.id).length
  const suspectRuleForReview = overridesCount >= 3

  // Verifica se é um tópico-ponte permitido ('SUGESTAO')
  if (matchingRule.bridgeTopics?.some(bt => tLower.includes(bt.toLowerCase()))) {
    return {
      status: 'SUGESTAO',
      canProceedWithJustification: true,
      matchedRule: matchingRule,
      message: `SUGESTÃO DE PONTE CURRICULAR (${matchingRule.id}): Este tema conecta o ano atual ao seguinte (${matchingRule.anchor.type === 'bncc' ? matchingRule.anchor.code : matchingRule.anchor.note}). Mantenha a abordagem introdutória/visual.`,
      suspectRuleForReview,
      transversalDirectives
    }
  }

  // Verifica se o tópico acionou alerta de fora de série ('AVISO')
  if (matchingRule.outOfGradeTopics?.some(ot => tLower.includes(ot.toLowerCase()))) {
    const effectiveSeverity = config.defaultBnccSeverity === 'BLOQUEIO' ? 'BLOQUEIO' : matchingRule.severity
    return {
      status: effectiveSeverity,
      canProceedWithJustification: effectiveSeverity !== 'BLOQUEIO',
      matchedRule: matchingRule,
      message: `AVISO CURRICULAR BNCC (${matchingRule.id} — Âncora ${matchingRule.anchor.type === 'bncc' ? matchingRule.anchor.code : 'Tradição'}): O tópico "${params.topic}" é previsto em série posterior na BNCC. ${matchingRule.rule}`,
      suspectRuleForReview,
      transversalDirectives
    }
  }

  return {
    status: 'OK',
    canProceedWithJustification: true,
    matchedRule: matchingRule,
    message: matchingRule.rule,
    suspectRuleForReview,
    transversalDirectives
  }
}
