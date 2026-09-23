/**
 * __tests__/portalNormalizer.test.ts
 * Suíte de testes unitários para a Camada 1 — Normalização Centralizada de Portais (Teacher AI).
 */

import { describe, it, expect } from 'vitest';
import * as TsNormalizer from '@/lib/portalNormalizer';

// Importa o módulo isomórfico da extensão
const JsNormalizer = require('../teacher-extension/portal_normalizer.js');

describe('PortalNormalizer — Centralização e Padronização Canônica', () => {
  describe('1. cleanNormalizeString & normalizeTitle', () => {
    it('remove acentos (NFD), converte para minúsculas e remove espaços das bordas', () => {
      const input = '  Açúcar, Frequência & Horários Escolares!  ';
      const expected = 'acucar, frequencia & horarios escolares!';

      expect(TsNormalizer.cleanNormalizeString(input)).toBe(expected);
      expect(JsNormalizer.cleanNormalizeString(input)).toBe(expected);
      expect(TsNormalizer.normalizeTitle(input)).toBe(expected);
    });

    it('lida graciosamente com valores nulos, indefinidos e números', () => {
      expect(TsNormalizer.cleanNormalizeString(null)).toBe('');
      expect(TsNormalizer.cleanNormalizeString(undefined)).toBe('');
      expect(TsNormalizer.cleanNormalizeString(12345)).toBe('12345');
      expect(JsNormalizer.cleanNormalizeString(null)).toBe('');
    });
  });

  describe('2. normalizeStudentName & matchStudentName', () => {
    it('colapsa múltiplos espaços consecutivos nos nomes dos alunos', () => {
      const raw = '   Alice    Maria   da    Silva   ';
      const expected = 'alice maria da silva';

      expect(TsNormalizer.normalizeStudentName(raw)).toBe(expected);
      expect(JsNormalizer.normalizeStudentName(raw)).toBe(expected);
    });

    it('faz casamento exato de nome completo ignorando caixa e acentos', () => {
      const portalRow = '101 | JOÃO VÍTOR SANTOS | 8.5 | PRESENTE';
      expect(TsNormalizer.matchStudentName(portalRow, 'João Vitor Santos')).toBe(true);
      expect(JsNormalizer.matchStudentName(portalRow, 'joao vitor santos')).toBe(true);
    });

    it('faz casamento difuso tolerando ausência de sobrenomes intermediários (primeiro + último)', () => {
      const portalRow = 'Matrícula 404 - Alice Silva (Turma 9B)';
      expect(TsNormalizer.matchStudentName(portalRow, 'Alice Maria de Souza Silva')).toBe(true);
      expect(JsNormalizer.matchStudentName(portalRow, 'Alice Maria de Souza Silva')).toBe(true);
    });

    it('rejeita casamentos de alunos não correspondentes', () => {
      const portalRow = 'Matrícula 505 - Bruno Oliveira';
      expect(TsNormalizer.matchStudentName(portalRow, 'Alice Silva')).toBe(false);
      expect(JsNormalizer.matchStudentName(portalRow, 'Bruno Silva')).toBe(false);
    });
  });

  describe('3. normalizeGrade (Guardião Pedagógico)', () => {
    it('converte decimais com vírgula para número de ponto flutuante', () => {
      expect(TsNormalizer.normalizeGrade('8,5')).toBe(8.5);
      expect(JsNormalizer.normalizeGrade('7,0')).toBe(7.0);
    });

    it('escala notas de 0 a 100 para a escala escolar oficial de 0 a 10', () => {
      expect(TsNormalizer.normalizeGrade('85')).toBe(8.5);
      expect(TsNormalizer.normalizeGrade(92)).toBe(9.2);
      expect(JsNormalizer.normalizeGrade('100')).toBe(10.0);
    });

    it('preserva notas padrão na faixa de 0 a 10', () => {
      expect(TsNormalizer.normalizeGrade(9.5)).toBe(9.5);
      expect(TsNormalizer.normalizeGrade('10')).toBe(10.0);
      expect(TsNormalizer.normalizeGrade('0')).toBe(0.0);
    });

    it('rejeita notas inválidas ou fora da faixa permitida', () => {
      expect(TsNormalizer.normalizeGrade('-1')).toBeNull();
      expect(TsNormalizer.normalizeGrade('105')).toBeNull();
      expect(TsNormalizer.normalizeGrade('abc')).toBeNull();
      expect(TsNormalizer.normalizeGrade('')).toBeNull();
      expect(TsNormalizer.normalizeGrade(null)).toBeNull();
    });
  });

  describe('4. normalizeBrazilianWeekday & extractWeekdayFromText', () => {
    it('reconhece todos os dias da semana canônicos em múltiplos formatos', () => {
      expect(TsNormalizer.normalizeBrazilianWeekday('Segunda-feira')?.key).toBe('segunda');
      expect(TsNormalizer.normalizeBrazilianWeekday('2ª-feira')?.key).toBe('segunda');
      expect(TsNormalizer.normalizeBrazilianWeekday('Terça')?.key).toBe('terca');
      expect(TsNormalizer.normalizeBrazilianWeekday('3ª')?.key).toBe('terca');
      expect(TsNormalizer.normalizeBrazilianWeekday('Quarta-feira')?.key).toBe('quarta');
      expect(TsNormalizer.normalizeBrazilianWeekday('Quinta')?.key).toBe('quinta');
      expect(TsNormalizer.normalizeBrazilianWeekday('Sexta-feira')?.key).toBe('sexta');
      expect(TsNormalizer.normalizeBrazilianWeekday('Sábado')?.key).toBe('sabado');
      expect(TsNormalizer.normalizeBrazilianWeekday('Domingo')?.key).toBe('domingo');
    });

    it('descarta falsos positivos com termos de tempo/período ("1º horário", "2º tempo")', () => {
      expect(TsNormalizer.normalizeBrazilianWeekday('1º horário')).toBeNull();
      expect(TsNormalizer.normalizeBrazilianWeekday('2º tempo')).toBeNull();
      expect(TsNormalizer.normalizeBrazilianWeekday('Período de Aula')).toBeNull();
      expect(TsNormalizer.normalizeBrazilianWeekday('Disciplina de Matemática')).toBeNull();
    });

    it('extrai dia da semana presente em frases livres da professora', () => {
      const match = TsNormalizer.extractWeekdayFromText('Agendar para a próxima quarta-feira de manhã');
      expect(match).not.toBeNull();
      expect(match?.key).toBe('quarta');
      expect(match?.name).toBe('4ª-feira (Quarta)');
    });
  });

  describe('5. identifyCurriculumSubject', () => {
    it('identifica disciplinas da BNCC em títulos e textos de navegação', () => {
      expect(TsNormalizer.identifyCurriculumSubject('Aulas de Língua Inglesa 6º Ano')).toBe('lingua inglesa');
      expect(TsNormalizer.identifyCurriculumSubject('Horário de Matemática')).toBe('matematica');
      expect(TsNormalizer.identifyCurriculumSubject('Diário de Ciências Biológicas')).toBe('ciencias');
      expect(TsNormalizer.identifyCurriculumSubject('Reunião pedagógica de pais')).toBeNull();
    });
  });

  describe('6. generateOrdinalSearchVariants', () => {
    it('gera variantes ordinais para termos como "sexto" ou "6"', () => {
      const variants = TsNormalizer.generateOrdinalSearchVariants('sexto ano');
      expect(variants).toContain('sexto ano');
      expect(variants).toContain('6 ano');
      expect(variants).toContain('6o ano');
      expect(variants).toContain('6º ano');
    });
  });
});
