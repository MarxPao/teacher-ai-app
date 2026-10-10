import { describe, it, expect } from 'vitest';
import {
  runReferenceExamBenchmark,
  REFERENCE_EXAM_BATTERY,
  type BenchmarkResult,
} from '@/lib/referenceExamBenchmark';

describe('D3: Benchmark de Provas de Referência e Taxa de Aceite Sem Edição', () => {
  it('deve possuir uma bateria de referência com pelo menos 10 provas cobrindo múltiplas áreas e anos', () => {
    expect(REFERENCE_EXAM_BATTERY).toBeDefined();
    expect(REFERENCE_EXAM_BATTERY.length).toBeGreaterThanOrEqual(10);

    const subjects = new Set(REFERENCE_EXAM_BATTERY.map((e) => e.subject));
    expect(subjects.size).toBeGreaterThanOrEqual(5);

    for (const exam of REFERENCE_EXAM_BATTERY) {
      expect(exam.id).toBeTruthy();
      expect(exam.title).toBeTruthy();
      expect(exam.gradeLevel).toBeTruthy();
      expect(exam.questions.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('deve auditar todas as provas contra os portões G1-G4 e calcular a taxa unmodifiedAcceptanceRate', () => {
    const result: BenchmarkResult = runReferenceExamBenchmark();

    expect(result.totalExams).toBe(REFERENCE_EXAM_BATTERY.length);
    expect(result.totalQuestions).toBeGreaterThanOrEqual(40);
    expect(result.unmodifiedAcceptedQuestions).toBeGreaterThan(0);

    // unmodifiedAcceptanceRate deve ser calculada estritamente como accepted / total
    const expectedRate = result.unmodifiedAcceptedQuestions / result.totalQuestions;
    expect(result.unmodifiedAcceptanceRate).toBeCloseTo(expectedRate, 4);

    // Na bateria de referência com questões canônicas bem formatadas, a taxa deve ser >= 80%
    expect(result.unmodifiedAcceptanceRate).toBeGreaterThanOrEqual(0.80);
    expect(result.synthetic_battery_gate_pass_rate).toBe(result.unmodifiedAcceptanceRate);

    // Deve reportar breakdown detalhado por disciplina e por portão
    expect(Object.keys(result.detailsPerSubject).length).toBeGreaterThanOrEqual(5);
    expect(result.rejectionBreakdown).toBeDefined();
    expect(typeof result.rejectionBreakdown.gate1Structure).toBe('number');
    expect(typeof result.rejectionBreakdown.gate2Haladyna).toBe('number');
    expect(typeof result.rejectionBreakdown.gate3Distractors).toBe('number');
    expect(typeof result.rejectionBreakdown.gate4Language).toBe('number');
  });

  it('deve identificar honestamente questões que falham nos portões sem mascarar violações', () => {
    const result: BenchmarkResult = runReferenceExamBenchmark();
    
    // A soma de aceitas e rejeitadas em cada categoria deve ser consistente
    const totalRejections =
      result.rejectionBreakdown.gate1Structure +
      result.rejectionBreakdown.gate2Haladyna +
      result.rejectionBreakdown.gate3Distractors +
      result.rejectionBreakdown.gate4Language;

    // Se houve rejeição, a soma dos portões com falha deve ser >= número de questões rejeitadas
    const rejectedCount = result.totalQuestions - result.unmodifiedAcceptedQuestions;
    if (rejectedCount > 0) {
      expect(totalRejections).toBeGreaterThanOrEqual(rejectedCount);
    }
  });
});
