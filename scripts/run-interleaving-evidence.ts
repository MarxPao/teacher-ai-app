import {
  createBalancedBlueprint,
  generateBlueprintPromptSection
} from '../lib/testBlueprintEngine'

console.log('================================================================================')
console.log('EVIDÊNCIA D — INTERCALAÇÃO CONTRASTANTE FORÇADA (INTERLEAVING EFFECT)')
console.log('================================================================================')

// Caso 1: Inglês — Present Perfect × Simple Past
const blueprintEn = createBalancedBlueprint({
  title: 'Avaliação Formativa de Aspecto Verbal',
  subject: 'English (ELT)',
  totalQuestions: 6,
  topics: ['Present Perfect', 'Simple Past'],
  includeSpacedRetrieval: false
})

console.log('--- CASO 1: INGLÊS (Present Perfect × Simple Past) ---')
console.log({
  totalItems: blueprintEn.totalItems,
  hasInterleaving: blueprintEn.hasInterleaving,
  contrastPairsCount: blueprintEn.contrastPairsCount,
  itemsSequence: blueprintEn.items.map(i => ({
    item: i.itemNumber,
    topic: i.topic,
    isContrastPair: i.isContrastPair,
    partnerTopic: i.contrastPartnerTopic
  }))
})
console.log('\n--- SEÇÃO DO PROMPT INJETADA NO MODELO ---')
console.log(generateBlueprintPromptSection(blueprintEn))

// Caso 2: Português — Crase Obrigatória × Crase Proibida
const blueprintPt = createBalancedBlueprint({
  title: 'Exercício Diagnóstico de Sintaxe e Regência',
  subject: 'Língua Portuguesa',
  totalQuestions: 4,
  topics: ['Crase Obrigatória', 'Crase Proibida'],
  includeSpacedRetrieval: false
})

console.log('\n--- CASO 2: PORTUGUÊS (Crase Obrigatória × Crase Proibida) ---')
console.log({
  totalItems: blueprintPt.totalItems,
  hasInterleaving: blueprintPt.hasInterleaving,
  contrastPairsCount: blueprintPt.contrastPairsCount,
  itemsSequence: blueprintPt.items.map(i => ({
    item: i.itemNumber,
    topic: i.topic,
    isContrastPair: i.isContrastPair,
    partnerTopic: i.contrastPartnerTopic
  }))
})
console.log('\n--- SEÇÃO DO PROMPT INJETADA NO MODELO ---')
console.log(generateBlueprintPromptSection(blueprintPt))
