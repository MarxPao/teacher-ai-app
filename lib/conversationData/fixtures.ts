/**
 * lib/conversationData/fixtures.ts
 *
 * Fixtures canônicas com nomes canário para testes sem áudio.
 */

export interface FixtureData {
  sessionId: string
  title: string
  sessionType: 'aula' | 'reuniao' | 'outro'
  totalDurationMs: number
  retentionDays?: number
  speakerMap: Array<{
    label: string
    name: string | null
    role: 'professor' | 'aluno' | 'coordenador' | 'desconhecido'
    source: 'manual' | 'inferido'
    confidence: number
  }>
  turns: Array<{
    id?: string
    speaker: string
    startMs: number
    endMs: number
    text: string
  }>
}

export const fixtureAula50Min: FixtureData = {
  sessionId: 'aula_50min_bio',
  title: 'Aula de Biologia - Ecossistemas e Cadeias Tróficas',
  sessionType: 'aula',
  totalDurationMs: 3000000, // 50 minutos
  retentionDays: 90,
  speakerMap: [
    { label: 'spk_prof', name: 'Professora Helena', role: 'professor', source: 'manual', confidence: 1.0 },
    { label: 'spk_aluno_arthur', name: 'Canário Arthur', role: 'aluno', source: 'inferido', confidence: 0.95 },
    { label: 'spk_aluno_beatriz', name: 'Canária Beatriz', role: 'aluno', source: 'inferido', confidence: 0.95 },
    { label: 'spk_aluno_carlos', name: 'Canário Carlos', role: 'aluno', source: 'inferido', confidence: 0.90 }
  ],
  turns: [
    {
      speaker: 'spk_prof',
      startMs: 0,
      endMs: 65000,
      text: 'Bom dia a todos! Hoje vamos nos aprofundar nas relações tróficas dos ecossistemas terrestres e marinhos.'
    },
    {
      speaker: 'spk_prof',
      startMs: 70000,
      endMs: 120000,
      text: 'Vimos na aula anterior que todo ecossistema depende de um fluxo constante de energia solar que é fixada por produtores primários.'
    },
    {
      speaker: 'spk_prof',
      startMs: 125000,
      endMs: 137000,
      text: 'Turma, como vocês explicariam o impacto na pirâmide ecológica se todos os produtores fossem dizimados por um evento climático extremo?'
    },
    // Espera: 137000 até 143500 (6500ms = 6.5s)
    {
      speaker: 'spk_aluno_arthur',
      startMs: 143500,
      endMs: 155000,
      text: 'Professora, os herbívoros ficariam imediatamente sem alimento e a base entraria em colapso, extinguindo os consumidores secundários em cadeia.'
    },
    {
      speaker: 'spk_prof',
      startMs: 158000,
      endMs: 170000,
      text: 'Muito bem articulado, Arthur! E as plantas são consideradas autótrofas?'
    },
    // Espera: 170000 até 172000 (2000ms = 2s)
    {
      speaker: 'spk_aluno_beatriz',
      startMs: 172000,
      endMs: 180000,
      text: 'Sim professora, porque elas produzem seu próprio alimento através da fotossíntese.'
    },
    {
      speaker: 'spk_aluno_carlos',
      startMs: 250000,
      endMs: 262000,
      text: 'Professora, o fluxo de energia sempre diminui a cada nível trófico ou pode aumentar nos decompositores?'
    },
    {
      speaker: 'spk_prof',
      startMs: 265000,
      endMs: 355000, // Monólogo longo de 90 segundos (90000ms)
      text: 'Excelente pergunta, Carlos! O fluxo de energia é estritamente unidirecional e decrescente ao longo da cadeia. A cada nível trófico, cerca de 90% da energia é dissipada em forma de calor metabólico e trabalho celular, restando apenas cerca de 10% para o nível seguinte. Os decompositores reciclam a matéria orgânica, mas a energia que passa por eles também segue a segunda lei da termodinâmica, sendo dissipada e não acumulada.'
    },
    {
      speaker: 'spk_prof',
      startMs: 400000,
      endMs: 412000,
      text: 'Quem pode me dar um exemplo de consumidor terciário no bioma cerrado?'
    },
    // Espera: 412000 até 417500 (5500ms = 5.5s)
    {
      speaker: 'spk_aluno_arthur',
      startMs: 417500,
      endMs: 425000,
      text: 'A onça-pintada se alimentando de um lobo-guará ou veado-campeiro!'
    },
    {
      speaker: 'spk_aluno_beatriz',
      startMs: 500000,
      endMs: 512000,
      text: 'Professora, as bactérias nitrificantes do solo também são produtoras na quimiossíntese?'
    },
    {
      speaker: 'spk_prof',
      startMs: 515000,
      endMs: 560000,
      text: 'Sim, Beatriz! Elas produzem matéria orgânica a partir de energia de reações químicas minerais sem precisar de luz.'
    },
    {
      speaker: 'spk_prof',
      startMs: 600000,
      endMs: 650000,
      text: 'Agora vamos analisar o ciclo do nitrogênio e como as bactérias fixadoras atuam nas raízes das leguminosas.'
    },
    {
      speaker: 'spk_prof',
      startMs: 700000,
      endMs: 715000,
      text: 'Carlos, qual é o principal gás que compõe a nossa atmosfera?'
    },
    {
      speaker: 'spk_aluno_carlos',
      startMs: 718000,
      endMs: 725000,
      text: 'É o gás nitrogênio, cerca de 78% do ar.'
    },
    {
      speaker: 'spk_prof',
      startMs: 730000,
      endMs: 800000,
      text: 'Correto! E nós conseguimos absorver o nitrogênio diretamente pela respiração pulmonar?'
    },
    {
      speaker: 'spk_aluno_arthur',
      startMs: 802000,
      endMs: 810000,
      text: 'Não, precisamos ingeri-lo através dos alimentos da cadeia trófica.'
    },
    {
      speaker: 'spk_prof',
      startMs: 2900000,
      endMs: 2980000,
      text: 'Para nossa próxima aula, façam os exercícios da página 45 a 48 do livro texto.'
    }
  ]
}

export const fixtureReuniaoPedagogica: FixtureData = {
  sessionId: 'reuniao_coord_pedag',
  title: 'Alinhamento Pedagógico Bimestral e Acompanhamento de Metas',
  sessionType: 'reuniao',
  totalDurationMs: 1800000, // 30 minutos
  retentionDays: 180,
  speakerMap: [
    { label: 'spk_coord', name: 'Coordenadora Laura', role: 'coordenador', source: 'manual', confidence: 1.0 },
    { label: 'spk_prof_helena', name: 'Professora Helena', role: 'professor', source: 'manual', confidence: 1.0 },
    { label: 'spk_prof_marcos', name: 'Professor Marcos', role: 'professor', source: 'manual', confidence: 1.0 }
  ],
  turns: [
    {
      speaker: 'spk_coord',
      startMs: 0,
      endMs: 30000,
      text: 'Bom dia colegas! Temos como pauta a consolidação das notas do 3º simulado e o cronograma das recuperações paralelas.'
    },
    {
      speaker: 'spk_coord',
      startMs: 35000,
      endMs: 60000,
      text: 'Marcos, você consegue ficar responsável por tabular as notas do simulado no sistema até sexta-feira às 17h?'
    },
    {
      speaker: 'spk_prof_marcos',
      startMs: 62000,
      endMs: 75000,
      text: 'Perfeito Laura, assumo essa responsabilidade e entrego a planilha com os dados até sexta-feira às 17h.'
    },
    {
      speaker: 'spk_coord',
      startMs: 80000,
      endMs: 105000,
      text: 'Ótimo. E quanto às oficinas de reforço, Helena, você finaliza o roteiro das atividades até segunda-feira?'
    },
    {
      speaker: 'spk_prof_helena',
      startMs: 108000,
      endMs: 125000,
      text: 'Sim Laura, eu me comprometo a estruturar e enviar o modelo de recuperação paralela de ciências até segunda-feira ao meio-dia.'
    },
    {
      speaker: 'spk_coord',
      startMs: 130000,
      endMs: 160000,
      text: 'Combinado então: Marcos entrega a tabulação até sexta 17h e Helena envia o modelo de reforço até segunda meio-dia.'
    }
  ]
}

export const fixtureAulaSobreposicaoDesconhecido: FixtureData = {
  sessionId: 'aula_sobreposicao_unk',
  title: 'Aula de Ecologia com Interrupções e Voz Não Identificada',
  sessionType: 'aula',
  totalDurationMs: 1200000,
  retentionDays: 60,
  speakerMap: [
    { label: 'spk_prof', name: 'Professora Helena', role: 'professor', source: 'manual', confidence: 1.0 },
    { label: 'spk_aluno_arthur', name: 'Canário Arthur', role: 'aluno', source: 'inferido', confidence: 0.9 },
    { label: 'spk_desconhecido', name: null, role: 'desconhecido', source: 'inferido', confidence: 0.3 }
  ],
  turns: [
    {
      speaker: 'spk_prof',
      startMs: 0,
      endMs: 30000,
      text: 'Iniciando o tópico de teias tróficas marinhas e zonas abissais.'
    },
    {
      speaker: 'spk_aluno_arthur',
      startMs: 50000,
      endMs: 62000,
      text: 'Professora, como os seres bentônicos sobrevivem sem luz alguma no fundo da fossa das Marianas?'
    },
    // Fala sobreposta de falante desconhecido (55000 a 64000)
    {
      speaker: 'spk_desconhecido',
      startMs: 55000,
      endMs: 64000,
      text: 'Ei, alguém me empresta uma caneta vermelha rápida?'
    },
    // Professora ignora a pergunta de Arthur e muda de assunto para chamada/aviso
    {
      speaker: 'spk_prof',
      startMs: 70000,
      endMs: 110000,
      text: 'Atenção classe! Por favor façam silêncio na sala. Guardem os estojos porque vou passar o aviso da coordenação sobre os crachás escolares.'
    }
  ]
}
