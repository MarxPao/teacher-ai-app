import { describe, it, expect } from 'vitest';
// @ts-ignore
const PortalNormalizer = require('../teacher-extension/portal_normalizer.js');
// @ts-ignore
const PortalDOMReader = require('../teacher-extension/portal_dom_reader.js');

describe('PortalDOMReader — Módulo Consolidado de Leitura e Inspeção de DOM', () => {

  describe('1. Parsing de Tabelas e Grids (readTable)', () => {
    it('extrai headers de <th> e linhas de <tr>/<td> com dados textuais limpos', () => {
      // Mock de elemento de tabela
      const mockTable: any = {
        id: 'tabela_notas',
        className: 'table-striped',
        querySelectorAll: (selector: string) => {
          if (selector.includes('thead th, th')) {
            return [
              { innerText: 'Matrícula' },
              { innerText: 'Nome do Aluno' },
              { innerText: 'Prova 1' },
              { innerText: 'Média' }
            ];
          }
          if (selector.includes('tr')) {
            return [
              {
                querySelectorAll: () => [
                  { innerText: 'Matrícula' },
                  { innerText: 'Nome do Aluno' },
                  { innerText: 'Prova 1' },
                  { innerText: 'Média' }
                ]
              },
              {
                querySelectorAll: () => [
                  { innerText: '101' },
                  { innerText: 'Lucas Silva' },
                  { innerText: '8,5' },
                  { innerText: '8,5' }
                ]
              },
              {
                querySelectorAll: () => [
                  { innerText: '102' },
                  { innerText: 'Mariana Costa' },
                  { innerText: '9,0' },
                  { innerText: '9,0' }
                ]
              }
            ];
          }
          return [];
        }
      };

      const result = PortalDOMReader.readTable(mockTable, { onlyVisible: false });
      expect(result).toBeDefined();
      expect(result.headers).toEqual(['Matrícula', 'Nome do Aluno', 'Prova 1', 'Média']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['101', 'Lucas Silva', '8,5', '8,5']);
      expect(result.rows[1]).toEqual(['102', 'Mariana Costa', '9,0', '9,0']);
    });

    it('promove a primeira linha quando não existem tags <th>', () => {
      const mockTable: any = {
        querySelectorAll: (selector: string) => {
          if (selector.includes('th')) return [];
          if (selector.includes('tr')) {
            return [
              {
                querySelectorAll: () => [
                  { innerText: 'Dia' },
                  { innerText: 'Horário' },
                  { innerText: 'Disciplina' }
                ]
              },
              {
                querySelectorAll: () => [
                  { innerText: 'Segunda' },
                  { innerText: '07:30 - 08:20' },
                  { innerText: 'Matemática' }
                ]
              }
            ];
          }
          return [];
        }
      };

      const result = PortalDOMReader.readTable(mockTable, { onlyVisible: false });
      expect(result.headers).toEqual(['Dia', 'Horário', 'Disciplina']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual(['Segunda', '07:30 - 08:20', 'Matemática']);
    });

    it('extrai valores de elementos interativos (checkbox [X]/[ ], input value)', () => {
      const mockCellCheckbox: any = {
        querySelector: (sel: string) => ({ type: 'checkbox', checked: true }),
        innerText: ''
      };
      const mockCellInput: any = {
        querySelector: (sel: string) => ({ type: 'text', value: '10.0' }),
        innerText: ''
      };

      expect(PortalDOMReader.getCellTextOrValue(mockCellCheckbox)).toBe('[X]');
      expect(PortalDOMReader.getCellTextOrValue(mockCellInput)).toBe('10.0');
    });
  });

  describe('2. Extração Estruturada de Horários / Calendário (extractScheduleEvents)', () => {
    it('extrai grade horizontal com dias nas colunas e horários nas linhas', () => {
      const scheduleTable = {
        id: 'grade_semanal',
        headers: ['Horário', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'],
        rows: [
          ['07:30 - 08:20', 'Matemática - 9º A', 'História - 8º B', 'Matemática - 9º A', 'Geografia - 7º C', 'Ciências - 6º A'],
          ['08:20 - 09:10', 'Matemática - 9º A', 'História - 8º B', 'Física - 9º A', 'Geografia - 7º C', 'Língua Portuguesa - 9º A'],
          ['09:30 - 10:20', '-', 'Educação Física', 'Língua Inglesa', '-', 'livre']
        ]
      };

      const events = PortalDOMReader.extractScheduleEvents([scheduleTable]);
      expect(events.length).toBeGreaterThanOrEqual(10);

      // Valida o primeiro evento de segunda-feira
      const seg1 = events.find((e: any) => e.dayOfWeek === 'segunda' && e.startTime === '07:30');
      expect(seg1).toBeDefined();
      expect(seg1.subject).toBe('Matemática');
      expect(seg1.className).toBe('9º A');
      expect(seg1.title).toBe('Matemática - 9º A');
      expect(seg1.type).toBe('aula');
      expect(seg1.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Valida que células com '-' e 'livre' foram ignoradas
      const emptyEvents = events.filter((e: any) => e.subject === '-' || e.subject === 'livre');
      expect(emptyEvents).toHaveLength(0);
    });

    it('extrai grade linear/tabular com colunas explícitas (Dia, Horário, Turma, Matéria)', () => {
      const linearTable = {
        id: 'lista_horarios',
        headers: ['Dia da Semana', 'Horário de Início', 'Turma', 'Disciplina'],
        rows: [
          ['Segunda-feira', '07:30 - 08:20', '9º Ano A', 'Matemática'],
          ['Terça-feira', '08:20 - 09:10', '8º Ano B', 'História'],
          ['Quarta-feira', '10:00 - 10:50', '7º Ano C', 'Ciências']
        ]
      };

      const events = PortalDOMReader.extractScheduleEvents([linearTable]);
      expect(events).toHaveLength(3);
      expect(events[0].dayOfWeek).toBe('segunda');
      expect(events[0].startTime).toBe('07:30');
      expect(events[0].subject).toBe('Matemática');
      expect(events[0].className).toBe('9º Ano A');
    });

    it('extrai eventos a partir de cards com texto contendo dia e intervalo de horário', () => {
      const snapshot = {
        tables: [],
        cards: [
          'Segunda-feira 07:30 às 08:20 - Aula de Matemática (Turma 901)',
          'Quinta-feira 14:00 - 15:30 - Reunião Pedagógica de Professores'
        ]
      };

      const events = PortalDOMReader.extractScheduleEvents(snapshot);
      expect(events).toHaveLength(2);
      expect(events[0].dayOfWeek).toBe('segunda');
      expect(events[0].startTime).toBe('07:30');
      expect(events[0].endTime).toBe('08:20');
      expect(events[1].dayOfWeek).toBe('quinta');
      expect(events[1].startTime).toBe('14:00');
    });
  });

  describe('3. Extração Unificada de Estudantes (extractStudents)', () => {
    it('extrai alunos de tabelas com identificação de matrícula e input de frequência', () => {
      const mockDoc: any = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('table')) {
            return [{
              querySelectorAll: (sub: string) => {
                if (sub.includes('thead th')) {
                  return [{ innerText: 'Nº' }, { innerText: 'Nome do Aluno' }, { innerText: 'Matrícula' }, { innerText: 'Presença' }];
                }
                if (sub.includes('tr')) {
                  return [
                    { querySelectorAll: () => [{ innerText: 'Nº' }, { innerText: 'Nome do Aluno' }, { innerText: 'Matrícula' }, { innerText: 'Presença' }] },
                    {
                      innerText: '1 Bernardo Oliveira 202401 Presença',
                      querySelectorAll: () => [
                        { innerText: '1' },
                        { innerText: 'Bernardo Oliveira' },
                        { innerText: '202401' },
                        { innerText: '' }
                      ],
                      querySelector: () => ({ id: 'freq_check_1', type: 'checkbox', checked: false })
                    },
                    {
                      innerText: '2 Clara Nunes 202402 Falta',
                      querySelectorAll: () => [
                        { innerText: '2' },
                        { innerText: 'Clara Nunes' },
                        { innerText: '202402' },
                        { innerText: '' }
                      ],
                      querySelector: () => ({ id: 'freq_check_2', type: 'checkbox', checked: true })
                    }
                  ];
                }
                return [];
              }
            }];
          }
          return [];
        }
      };

      const students = PortalDOMReader.extractStudents(mockDoc);
      expect(students).toHaveLength(2);
      expect(students[0].name).toBe('Bernardo Oliveira');
      expect(students[0].matricula).toBe('202401');
      expect(students[0].inputId).toBe('freq_check_1');
      expect(students[0].currentValue).toBe('Presença');

      expect(students[1].name).toBe('Clara Nunes');
      expect(students[1].matricula).toBe('202402');
      expect(students[1].currentValue).toBe('Falta');
    });
  });

  describe('4. Extração de Notas e Avaliações (extractGrades)', () => {
    it('extrai notas numéricas normalizadas associando estudante e avaliação', () => {
      const gradeTable = {
        headers: ['Aluno', 'Prova 1', 'Trabalho', 'Média Final'],
        rows: [
          ['Alice Santos', '8,5', '90', '8.8'],
          ['Bruno Lima', '6,0', '7,5', '6.8']
        ]
      };

      const grades = PortalDOMReader.extractGrades(null, [gradeTable]);
      expect(grades).toHaveLength(6);

      // Valida normalização da nota '90' (escala 0-100 convertida para 9.0)
      const aliceTrabalho = grades.find((g: any) => g.studentName === 'Alice Santos' && g.assessmentName === 'Trabalho');
      expect(aliceTrabalho).toBeDefined();
      expect(aliceTrabalho.grade).toBe(9.0);

      // Valida nota decimal com vírgula '8,5' convertida para 8.5
      const aliceP1 = grades.find((g: any) => g.studentName === 'Alice Santos' && g.assessmentName === 'Prova 1');
      expect(aliceP1).toBeDefined();
      expect(aliceP1.grade).toBe(8.5);
    });
  });

  describe('5. Agregação Multi-Frame (aggregateFrameResults)', () => {
    it('combina dados de múltiplos frames sem duplicar tabelas nem estudantes', () => {
      const frame1 = {
        sucesso: true,
        activeTab: 'Horários',
        tables: [{ headers: ['H', 'Seg'], rows: [['07:30', 'Matemática']] }],
        students: [{ name: 'Diego Ramos', matricula: '101' }],
        events: [{ dayOfWeek: 'segunda', startTime: '07:30', title: 'Matemática' }]
      };

      const frame2 = {
        sucesso: true,
        activeTab: 'Horários',
        tables: [
          { headers: ['H', 'Seg'], rows: [['07:30', 'Matemática']] }, // Duplicada
          { headers: ['H', 'Ter'], rows: [['08:20', 'História']] }    // Nova
        ],
        students: [
          { name: 'Diego Ramos', matricula: '101' },                   // Duplicado
          { name: 'Elena Souza', matricula: '102' }                    // Novo
        ],
        events: [
          { dayOfWeek: 'terca', startTime: '08:20', title: 'História' }
        ]
      };

      const aggregated = PortalDOMReader.aggregateFrameResults([frame1, frame2]);
      expect(aggregated.sucesso).toBe(true);
      expect(aggregated.tables).toHaveLength(2);
      expect(aggregated.students).toHaveLength(2);
      expect(aggregated.events).toHaveLength(2);
    });
  });

});
