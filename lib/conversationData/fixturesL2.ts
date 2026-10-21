/**
 * lib/conversationData/fixturesL2.ts
 *
 * Fixture de Aula de Língua Adicional (Inglês) para testes de regras de L2 (C4).
 * Nomes canário, zero dados reais de alunos.
 */

import type { FixtureData } from './fixtures'

export const fixtureAulaInglesL2: FixtureData & { discipline: string } = {
  sessionId: 'aula_45min_ingles_l2',
  title: 'Aula de Língua Inglesa - 9º Ano - Daily Routines & Opinions',
  sessionType: 'aula',
  discipline: 'Língua Inglesa',
  totalDurationMs: 2700000, // 45 min
  retentionDays: 90,
  speakerMap: [
    { label: 'spk_teacher_clark', name: 'Canário Teacher Clark', role: 'professor', source: 'manual', confidence: 1.0 },
    { label: 'spk_student_david', name: 'Canário David', role: 'aluno', source: 'inferido', confidence: 0.95 },
    { label: 'spk_student_sarah', name: 'Canária Sarah', role: 'aluno', source: 'inferido', confidence: 0.95 }
  ],
  turns: [
    {
      speaker: 'spk_teacher_clark',
      startMs: 0,
      endMs: 60000,
      text: 'Good morning everyone! Today we will discuss our daily habits and express our opinions about healthy lifestyles.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 65000,
      endMs: 110000,
      text: 'First let us review some common frequency adverbs like always usually sometimes and never.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 115000,
      endMs: 125000,
      text: 'David, do you usually wake up early on weekends?'
    },
    {
      speaker: 'spk_student_david',
      startMs: 128000,
      endMs: 135000,
      text: 'No teacher, I never wake up before ten on Saturday.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 140000,
      endMs: 180000,
      text: 'Very good use of never! And Sarah, what is your favorite morning routine activity?'
    },
    {
      speaker: 'spk_student_sarah',
      startMs: 184000,
      endMs: 195000,
      text: 'I always have breakfast with orange juice and listen to podcasts.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 200000,
      endMs: 310000,
      text: 'Listening to podcasts is a great way to acquire comprehensible input naturally every single morning.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 315000,
      endMs: 325000,
      text: 'Is orange juice rich in vitamin C, class?'
    },
    {
      speaker: 'spk_student_david',
      startMs: 327000,
      endMs: 332000,
      text: 'Yes it is.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 340000,
      endMs: 350000,
      text: 'Do we need vitamins for our immune system?'
    },
    {
      speaker: 'spk_student_sarah',
      startMs: 352000,
      endMs: 357000,
      text: 'Yes we do.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 360000,
      endMs: 375000,
      text: 'How would you explain the importance of a balanced diet in your own words?'
    },
    {
      speaker: 'spk_student_david',
      startMs: 382000,
      endMs: 400000,
      text: 'A balanced diet gives energy to study and protects our body against diseases.'
    },
    {
      speaker: 'spk_teacher_clark',
      startMs: 410000,
      endMs: 500000,
      text: 'Outstanding explanation! For next class please prepare a short one minute presentation about your favorite meal.'
    }
  ]
}
