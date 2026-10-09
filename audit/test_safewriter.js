/**
 * audit/test_safewriter.js — Suíte de Testes do SafeWriter
 * 
 * Valida os contratos estritos de segurança e integridade do SafeWriter:
 * 1. Verificação de Visibilidade (display, visibility, opacity, dimensões, clip).
 * 2. Detecção e Bloqueio de Honeypots (aria-hidden, coordenadas offscreen, nomes armadilha).
 * 3. Amarração Relacional Aluno <-> Linha da Tabela.
 * 4. Validações de Estado (disabled, readOnly, tipos inválidos).
 */

'use strict';

const path = require('path');
const modulePath = path.resolve(__dirname, '../teacher-extension/safeWriter.js');

function createMockElement(options = {}) {
  const {
    tagName = 'input',
    type = 'checkbox',
    style = {},
    attributes = {},
    rect = { width: 20, height: 20, top: 100, left: 100, right: 120, bottom: 120 },
    offsetWidth = 20,
    offsetHeight = 20,
    disabled = false,
    readOnly = false,
    rowText = null,
    parent = null
  } = options;

  const element = {
    tagName: tagName.toUpperCase(),
    type,
    style: { ...style },
    attributes: { ...attributes },
    offsetWidth,
    offsetHeight,
    disabled,
    readOnly,
    getAttribute(name) {
      return this.attributes[name] !== undefined ? String(this.attributes[name]) : null;
    },
    hasAttribute(name) {
      return this.attributes[name] !== undefined;
    },
    getBoundingClientRect() {
      return { ...rect };
    },
    closest(selector) {
      if (rowText !== null) {
        return {
          tagName: 'TR',
          textContent: rowText,
          contains() { return true; }
        };
      }
      return parent ? parent.closest(selector) : null;
    }
  };

  return element;
}

const TEST_CASES = [
  // --- Grupo 1: Visibilidade ---
  {
    id: "TC01_VALID_VISIBLE_ELEMENT",
    desc: "Elemento padrão visível com dimensões normais em linha correta -> canWrite: true",
    element: createMockElement({ rowText: "1 | Mariana Lima | 2026" }),
    studentName: "Mariana Lima",
    expectedCanWrite: true,
    expectedReason: null
  },
  {
    id: "TC02_DISPLAY_NONE",
    desc: "Elemento com style.display='none' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ style: { display: 'none' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "TC03_VISIBILITY_HIDDEN",
    desc: "Elemento com style.visibility='hidden' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ style: { visibility: 'hidden' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "TC04_VISIBILITY_COLLAPSE",
    desc: "Elemento com style.visibility='collapse' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ style: { visibility: 'collapse' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "TC05_OPACITY_ZERO",
    desc: "Elemento com style.opacity='0' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ style: { opacity: '0' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "TC06_ZERO_DIMENSIONS",
    desc: "Elemento com offsetWidth=0 e offsetHeight=0 -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ offsetWidth: 0, offsetHeight: 0, rect: { width: 0, height: 0, top: 0, left: 0 }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "TC07_CLIP_RECT_ZERO",
    desc: "Elemento com clip='rect(0px, 0px, 0px, 0px)' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    element: createMockElement({ style: { clip: 'rect(0px, 0px, 0px, 0px)' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },

  // --- Grupo 2: Honeypots e Armadilhas ---
  {
    id: "TC08_HONEYPOT_ARIA_HIDDEN",
    desc: "Input com aria-hidden='true' -> canWrite: false, HONEYPOT_DETECTED",
    element: createMockElement({ attributes: { 'aria-hidden': 'true' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "TC09_HONEYPOT_OFFSCREEN_LEFT",
    desc: "Input posicionado fora da tela (left: -9999px) -> canWrite: false, HONEYPOT_DETECTED",
    element: createMockElement({ style: { left: '-9999px' }, rect: { left: -9999, top: 10, width: 20, height: 20 }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "TC10_HONEYPOT_OFFSCREEN_TOP",
    desc: "Input posicionado fora da tela (top: -5000px) -> canWrite: false, HONEYPOT_DETECTED",
    element: createMockElement({ style: { top: '-5000px' }, rect: { left: 10, top: -5000, width: 20, height: 20 }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "TC11_HONEYPOT_SUSPICIOUS_NAME",
    desc: "Input com atributo name='trap_anti_bot' -> canWrite: false, HONEYPOT_DETECTED",
    element: createMockElement({ attributes: { name: 'trap_anti_bot' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "TC12_HONEYPOT_SUSPICIOUS_ID",
    desc: "Input com id='bot_honey_check' -> canWrite: false, HONEYPOT_DETECTED",
    element: createMockElement({ attributes: { id: 'bot_honey_check' }, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },

  // --- Grupo 3: Amarração Relacional Aluno <-> Linha ---
  {
    id: "TC13_STUDENT_ROW_MATCH_EXACT",
    desc: "Input em linha com nome exato do aluno -> canWrite: true",
    element: createMockElement({ rowText: "101 | Mariana Lima Silva | Presente" }),
    studentName: "Mariana Lima Silva",
    expectedCanWrite: true,
    expectedReason: null
  },
  {
    id: "TC14_STUDENT_ROW_MATCH_NORMALIZED",
    desc: "Input em linha com acentos normalizados ('mariana lima' vs 'Mariána Líma') -> canWrite: true",
    element: createMockElement({ rowText: "Mariána Líma" }),
    studentName: "mariana lima",
    expectedCanWrite: true,
    expectedReason: null
  },
  {
    id: "TC15_STUDENT_ROW_MISMATCH",
    desc: "Input em linha de outro aluno ('Carlos Eduardo' em vez de 'Mariana Lima') -> canWrite: false, STUDENT_MISMATCH",
    element: createMockElement({ rowText: "Carlos Eduardo da Silva" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "STUDENT_MISMATCH"
  },
  {
    id: "TC16_STUDENT_ROW_MISSING",
    desc: "Input órfão sem linha pai no DOM -> canWrite: false, STUDENT_MISMATCH",
    element: createMockElement({ rowText: null }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "STUDENT_MISMATCH"
  },

  // --- Grupo 4: Contratos e Estados de Controle (Fail-Closed) ---
  {
    id: "TC17_ELEMENT_DISABLED",
    desc: "Input desabilitado (disabled=true) -> canWrite: false, ELEMENT_DISABLED",
    element: createMockElement({ disabled: true, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_DISABLED"
  },
  {
    id: "TC18_ELEMENT_READONLY",
    desc: "Input somente leitura (readOnly=true) -> canWrite: false, ELEMENT_READONLY",
    element: createMockElement({ readOnly: true, rowText: "Mariana Lima" }),
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "ELEMENT_READONLY"
  },
  {
    id: "TC19_ELEMENT_NULL",
    desc: "Elemento alvo null -> canWrite: false, INVALID_ELEMENT",
    element: null,
    studentName: "Mariana Lima",
    expectedCanWrite: false,
    expectedReason: "INVALID_ELEMENT"
  },
  {
    id: "TC20_STUDENT_NAME_EMPTY",
    desc: "Nome do aluno vazio -> canWrite: false, INVALID_STUDENT_NAME",
    element: createMockElement({ rowText: "Mariana Lima" }),
    studentName: "",
    expectedCanWrite: false,
    expectedReason: "INVALID_STUDENT_NAME"
  }
];

function runSuite() {
  let SafeWriter;
  try {
    SafeWriter = require(modulePath);
  } catch (err) {
    console.error(`[ERRO FATAL] Não foi possível carregar o módulo em ${modulePath}:`, err.message);
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log(`  AVALIAÇÃO DO SAFEWRITER (${TEST_CASES.length} CASOS)`);
  console.log("=======================================================\n");

  let passed = 0;
  let failures = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    let res;
    try {
      res = SafeWriter.canSafelyWrite(tc.element, tc.studentName);
    } catch (err) {
      failures.push({ id: tc.id, desc: tc.desc, error: err.message });
      console.log(`[${String(i + 1).padStart(2, '0')}] ${tc.id}: FAIL (exceção: ${err.message})`);
      continue;
    }

    const matchesCanWrite = (res && res.canWrite === tc.expectedCanWrite);
    const matchesReason = (tc.expectedReason === null) ? (res.reason === null || res.reason === undefined) : (res.reason === tc.expectedReason);

    if (matchesCanWrite && matchesReason) {
      passed++;
      console.log(`[${String(i + 1).padStart(2, '0')}] ${tc.id}: PASS`);
    } else {
      failures.push({
        id: tc.id,
        desc: tc.desc,
        expected: { canWrite: tc.expectedCanWrite, reason: tc.expectedReason },
        obtained: { canWrite: res ? res.canWrite : undefined, reason: res ? res.reason : undefined }
      });
      console.log(`[${String(i + 1).padStart(2, '0')}] ${tc.id}: FAIL`);
      console.log(`     Esperado: canWrite=${tc.expectedCanWrite}, reason=${tc.expectedReason}`);
      console.log(`     Obtido:   canWrite=${res ? res.canWrite : 'null'}, reason=${res ? res.reason : 'null'}`);
    }
  }

  console.log("\n=======================================================");
  console.log(`  RESULTADO FINAL: ${passed} aprovados, ${failures.length} falhos (de ${TEST_CASES.length})`);
  console.log(`  Falhas: ${failures.length}`);
  console.log("=======================================================\n");

  if (failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSuite();
