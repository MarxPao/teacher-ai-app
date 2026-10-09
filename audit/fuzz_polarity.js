/**
 * audit/fuzz_polarity.js — Teste de Fuzzing Determinístico com Invariantes
 * 
 * DECLARAÇÃO EXPLÍCITA DE ESCOPO:
 * O que este teste GARANTE:
 * - Robustez de execução (zero exceções não tratadas / crashes em tipos anômalos, unicode, strings longas, objetos).
 * - Integridade de forma e tipos dos dados de retorno (canResolve é boolean, shouldBeChecked é boolean ou null).
 * - Invariantes estruturais (canResolve=true => polarity in {'POSITIVE', 'NEGATIVE'} e shouldBeChecked boolean).
 * - Invariante fail-closed estrutural (canResolve=false => shouldBeChecked === null).
 * - Invariante semântica determinística (entradas sem nenhum termo semântico reconhecido => canResolve=false).
 * 
 * O que este teste NÃO GARANTE:
 * - NÃO garante a corretude semântica de polaridade pedagógica (ex.: se um termo específico mapeia para POSITIVE ou NEGATIVE).
 *   A corretude de polaridade pedagógica é garantida exclusivamente pela suíte determinística de 66 casos em audit/polarity_test_cases.json.
 */

'use strict';

const path = require('path');
const modulePath = path.resolve(__dirname, '../teacher-extension/attendancePolarity.js');
const AttendancePolarity = require(modulePath);

// PRNG Determinístico (Mulberry32) com seed fixa
function createMulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXED_SEED = 0x12345678;
const rng = createMulberry32(FIXED_SEED);

// Corpus de entradas extremas para teste de estresse
const CORPUS = [
  null,
  undefined,
  0,
  1,
  -1,
  123.456,
  NaN,
  Infinity,
  -Infinity,
  true,
  false,
  "",
  " ",
  "   \t\r\n   ",
  "a".repeat(10000),
  "Presença",
  "Falta",
  "Presente",
  "Ausente",
  "Status",
  "Não compareceu",
  "Not present",
  "Sem falta",
  "Não ausente",
  "Pre-sente",
  "Rua Asfaltou",
  "🎉👨‍🏫📝✨🚀",
  "مرحبا بالعالم",
  "你好世界",
  "Привет мир",
  "ÁÉÍÓÚçãõñü",
  "\0\x01\x02\n\r\t",
  "'; DROP TABLE students; --",
  "<script>alert(1)</script>",
  {},
  { a: 1, b: "Presença", c: null, d: [1, 2] },
  { title: "Falta", "aria-label": "Ausente" },
  { "aria-label": 123, title: ["x"] },
  [],
  [1, 2, 3],
  ["Presença", "Falta", null, undefined],
  [[[]]],
  new Date(),
  /regex/g,
  Symbol("test"),
  function () { },
  () => { }
];

function getRandomVal() {
  const idx = Math.floor(rng() * CORPUS.length);
  return CORPUS[idx];
}

function hasAnyRecognizedPolarityKeyword(val) {
  if (!val) return false;
  if (typeof val === 'string') {
    return /(presen|falta|ausen|attend|comparec)/i.test(val);
  }
  if (Array.isArray(val)) {
    return val.some(hasAnyRecognizedPolarityKeyword);
  }
  if (typeof val === 'object') {
    return Object.values(val).some(hasAnyRecognizedPolarityKeyword);
  }
  return false;
}

const VALID_POLARITIES = new Set([
  'POSITIVE',
  'NEGATIVE',
  'AMBIGUOUS',
  'CONFLICT',
  'INVALID_INTENT'
]);

function runFuzzSuite(iterations = 500) {
  console.log(`=======================================================`);
  console.log(`  FUZZ TEST DETERMINÍSTICO (SEED: 0x${FIXED_SEED.toString(16)})`);
  console.log(`  Iterações planejadas: ${iterations}`);
  console.log(`=======================================================\n`);

  let passedIterations = 0;
  let exceptionsCount = 0;
  let invariantFailures = [];
  let semanticNoSignalCount = 0;
  let semanticNoSignalPassed = 0;
  let semanticFailuresCount = 0;

  for (let i = 1; i <= iterations; i++) {
    const header = getRandomVal();
    const label = getRandomVal();
    // Intercala intenções válidas e aleatórias para cobrir ambos os ramos de resolução
    let intent;
    const intentPicker = Math.floor(rng() * 4);
    if (intentPicker === 0) intent = 'PRESENCA';
    else if (intentPicker === 1) intent = 'FALTA';
    else if (intentPicker === 2) intent = 'PRESENTE';
    else intent = getRandomVal();

    const extra = getRandomVal();

    let res;
    try {
      res = AttendancePolarity.resolveAttendancePolarity(header, label, intent, extra);
    } catch (err) {
      exceptionsCount++;
      invariantFailures.push({
        iteration: i,
        type: 'EXCEPTION',
        error: err.message,
        inputs: { header, label, intent, extra }
      });
      continue;
    }

    // Invariante 1: O resultado deve ser um objeto válido
    if (!res || typeof res !== 'object') {
      invariantFailures.push({
        iteration: i,
        type: 'INVALID_OBJECT_RETURNED',
        res,
        inputs: { header, label, intent, extra }
      });
      continue;
    }

    // Invariante 2: canResolve deve ser booleano
    if (typeof res.canResolve !== 'boolean') {
      invariantFailures.push({
        iteration: i,
        type: 'CAN_RESOLVE_NOT_BOOLEAN',
        res,
        inputs: { header, label, intent, extra }
      });
      continue;
    }

    // Invariante 3: polarity deve pertencer ao conjunto canônico
    if (!VALID_POLARITIES.has(res.polarity)) {
      invariantFailures.push({
        iteration: i,
        type: 'UNKNOWN_POLARITY_VALUE',
        res,
        inputs: { header, label, intent, extra }
      });
      continue;
    }

    // Invariante 4: canResolve === true => polarity in {'POSITIVE', 'NEGATIVE'} e shouldBeChecked booleano
    if (res.canResolve === true) {
      const validTruePolarity = (res.polarity === 'POSITIVE' || res.polarity === 'NEGATIVE');
      const validBooleanChecked = (typeof res.shouldBeChecked === 'boolean');
      if (!validTruePolarity || !validBooleanChecked) {
        invariantFailures.push({
          iteration: i,
          type: 'CAN_RESOLVE_TRUE_CONTRACT_VIOLATION',
          reason: `canResolve=true exige polarity in {'POSITIVE', 'NEGATIVE'} e shouldBeChecked booleano (obtido: polarity=${res.polarity}, shouldBeChecked=${res.shouldBeChecked})`,
          res,
          inputs: { header, label, intent, extra }
        });
        continue;
      }
    }

    // Invariante 5: canResolve === false => shouldBeChecked === null
    if (res.canResolve === false) {
      if (res.shouldBeChecked !== null) {
        invariantFailures.push({
          iteration: i,
          type: 'CAN_RESOLVE_FALSE_CONTRACT_VIOLATION',
          reason: `canResolve=false exige shouldBeChecked === null (obtido: ${res.shouldBeChecked})`,
          res,
          inputs: { header, label, intent, extra }
        });
        continue;
      }
    }

    // Invariante 6 (Semântica barata e determinística):
    // Se nenhum sinal nas entradas (header, label, extra) contém termos reconhecidos de frequência, o resultado deve ser canResolve=false
    const hasAnySignal = hasAnyRecognizedPolarityKeyword(header) ||
                         hasAnyRecognizedPolarityKeyword(label) ||
                         hasAnyRecognizedPolarityKeyword(extra);
    if (!hasAnySignal) {
      semanticNoSignalCount++;
      if (res.canResolve === false) {
        semanticNoSignalPassed++;
      } else {
        semanticFailuresCount++;
        invariantFailures.push({
          iteration: i,
          type: 'SEMANTIC_FAIL_CLOSED_VIOLATION',
          reason: 'Nenhum termo de presença/ausência reconhecido nas entradas, mas canResolve retornou true',
          res,
          inputs: { header, label, intent, extra }
        });
        continue;
      }
    }

    passedIterations++;
  }

  console.log(`=== RESULTADO DO FUZZ TEST ===`);
  console.log(`Total de iterações executadas: ${iterations}`);
  console.log(`Iterações aprovadas com invariantes válidas: ${passedIterations}`);
  console.log(`Exceções não tratadas: ${exceptionsCount}`);
  console.log(`Violações de invariantes: ${invariantFailures.length}`);
  console.log(`Iterações com entrada sem termos de frequência reconhecidos: ${semanticNoSignalCount}`);
  console.log(`Dessas, com canResolve=false: ${semanticNoSignalPassed} (esperado: todas)`);
  console.log(`Violações do invariante semântico: ${semanticFailuresCount}`);

  if (invariantFailures.length > 0) {
    console.error(`\n[FALHA] ${invariantFailures.length} iterações violaram o contrato! Primeiras 3 falhas:`);
    console.error(JSON.stringify(invariantFailures.slice(0, 3), null, 2));
    process.exit(1);
  }

  console.log(`\n[SUCESSO] Todas as ${iterations} iterações respeitaram 100% dos invariantes com seed 0x${FIXED_SEED.toString(16)}.`);
}

if (require.main === module) {
  runFuzzSuite(500);
}

module.exports = { runFuzzSuite, FIXED_SEED };
