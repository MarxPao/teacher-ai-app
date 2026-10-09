/**
 * audit/test_safewriter_hardening_a.js — Suíte de Testes da TASK-003a (Escopos 1 e 2)
 * 
 * Validação de:
 * 1. Novas formas de ocultação (transform scale 0, clip-path zero area, font-size 0, pointer-events none,
 *    occlusão por elementFromPoint, ancestral oculto, position + translate offscreen) [H01 a H14].
 * 2. Honeypots estruturais (tabindex -1 oculto, autocomplete="off" fora de linha, inputs duplicados na linha) [H15 a H17].
 */

'use strict';

const path = require('path');
const modulePath = path.resolve(__dirname, '../teacher-extension/safeWriter.js');

function createNode(options = {}) {
  const {
    tagName = 'INPUT',
    type = 'checkbox',
    name = null,
    id = null,
    className = '',
    style = {},
    attributes = {},
    rect = { width: 24, height: 24, top: 100, left: 100, right: 124, bottom: 124 },
    offsetWidth = 24,
    offsetHeight = 24,
    disabled = false,
    readOnly = false,
    textContent = '',
    parent = null,
    children = []
  } = options;

  const node = {
    tagName: tagName.toUpperCase(),
    type,
    name,
    id,
    className,
    style: { ...style },
    attributes: { ...attributes },
    offsetWidth,
    offsetHeight,
    disabled,
    readOnly,
    textContent,
    parentElement: parent,
    parentNode: parent,
    children: [...children],
    getAttribute(attr) {
      if (this.attributes[attr] !== undefined) return String(this.attributes[attr]);
      if (attr === 'name' && this.name) return this.name;
      if (attr === 'id' && this.id) return this.id;
      if (attr === 'class' && this.className) return this.className;
      return null;
    },
    hasAttribute(attr) {
      return this.attributes[attr] !== undefined || (attr === 'name' && !!this.name) || (attr === 'id' && !!this.id);
    },
    getBoundingClientRect() {
      return { ...rect };
    },
    closest(selector) {
      let curr = this;
      while (curr) {
        if (selector.includes('tr') && curr.tagName === 'TR') return curr;
        if (selector.includes('table') && curr.tagName === 'TABLE') return curr;
        if (selector.includes('[role="row"]') && curr.getAttribute && curr.getAttribute('role') === 'row') return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    contains(other) {
      let curr = other;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    querySelectorAll(selector) {
      const results = [];
      function traverse(n) {
        for (const child of (n.children || [])) {
          if (selector === 'tr' && child.tagName === 'TR') results.push(child);
          if (selector === 'input' && child.tagName === 'INPUT') results.push(child);
          traverse(child);
        }
      }
      traverse(this);
      return results;
    }
  };

  for (const c of node.children) {
    c.parentElement = node;
    c.parentNode = node;
  }

  return node;
}

function buildTableContext(rowsData) {
  const table = createNode({ tagName: 'TABLE' });
  const rows = [];
  for (const r of rowsData) {
    const tr = createNode({ tagName: 'TR', textContent: r.text, parent: table });
    const input = createNode({
      tagName: 'INPUT',
      name: r.inputName || 'presenca',
      attributes: r.inputAttrs || {},
      style: r.inputStyle || {},
      rect: r.rect || { width: 20, height: 20, top: 100, left: 100, right: 120, bottom: 120 },
      parent: tr
    });
    tr.children.push(input);
    if (r.extraInputs) {
      for (const extra of r.extraInputs) {
        const extraEl = createNode({
          tagName: 'INPUT',
          name: extra.name || r.inputName || 'presenca',
          parent: tr
        });
        tr.children.push(extraEl);
      }
    }
    rows.push({ tr, input });
    table.children.push(tr);
  }
  return { table, rows };
}

const HARDENING_CASES_A = [
  // 1. Transform scale(0)
  {
    id: "H01_SCALE_ZERO_REJECT",
    desc: "Ocultação via style.transform='scale(0)' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.transform = 'scale(0)';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H02_SCALE_NORMAL_CONTROL",
    desc: "Controle de escala: style.transform='scale(1)' ou rotate(0deg) -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.transform = 'scale(1)';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 2. Clip-path nulo
  {
    id: "H03_CLIP_PATH_ZERO_REJECT",
    desc: "Ocultação via style.clipPath='circle(0)' ou inset(100%) -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.clipPath = 'circle(0 at 50% 50%)';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H04_CLIP_PATH_VALID_CONTROL",
    desc: "Controle de clip-path legítimo: inset(0%) -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.clipPath = 'inset(0%)';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 3. Font-size 0
  {
    id: "H05_FONT_SIZE_ZERO_REJECT",
    desc: "Ocultação via style.fontSize='0px' em controle de texto/seleção -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.fontSize = '0px';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H06_FONT_SIZE_VALID_CONTROL",
    desc: "Controle de font-size padrão: style.fontSize='14px' -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.fontSize = '14px';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 4. Pointer-events none
  {
    id: "H07_POINTER_EVENTS_NONE_REJECT",
    desc: "Interação bloqueada por style.pointerEvents='none' -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.pointerEvents = 'none';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H08_POINTER_EVENTS_AUTO_CONTROL",
    desc: "Controle de pointer-events legítimo: 'auto' -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.pointerEvents = 'auto';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 5. Elemento coberto por outro (elementFromPoint)
  {
    id: "H09_OCCLUDED_BY_OVERLAY_REJECT",
    desc: "Elemento oculto/coberto por modal overlay em elementFromPoint -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      const overlayEl = createNode({ tagName: 'DIV', id: 'blocking-overlay' });
      const doc = {
        elementFromPoint(x, y) { return overlayEl; }
      };
      return { el: rows[0].input, student: "Mariana Lima", opts: { doc } };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H10_TOP_ELEMENT_EXPOSED_CONTROL",
    desc: "Controle de elementFromPoint: o próprio elemento é retornado no centro -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      const doc = {
        elementFromPoint(x, y) { return rows[0].input; }
      };
      return { el: rows[0].input, student: "Mariana Lima", opts: { doc } };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 6. Ancestral oculto (cadeia de pais)
  {
    id: "H11_ANCESTOR_HIDDEN_REJECT",
    desc: "Ancestral (TR ou TBODY) com display='none' propaga invisibilidade -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].tr.style.display = 'none';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H12_ANCESTOR_VISIBLE_CONTROL",
    desc: "Controle de ancestral: pais visíveis com display='table-row' -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].tr.style.display = 'table-row';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // 7. Fora do viewport por translate
  {
    id: "H13_OFFSCREEN_BY_TRANSLATE_REJECT",
    desc: "Elemento deslocado para fora da tela por transform: translate(-9999px) -> canWrite: false, ELEMENT_NOT_VISIBLE",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.transform = 'translate(-9999px, 0px)';
      rows[0].input.rect = { left: -9999, right: -9975, top: 100, bottom: 124, width: 24, height: 24 };
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "ELEMENT_NOT_VISIBLE"
  },
  {
    id: "H14_ONSCREEN_TRANSLATE_CONTROL",
    desc: "Controle de translate visível dentro da tela: translate(0px, 0px) -> canWrite: true",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.style.transform = 'translate(0px, 0px)';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: true,
    expectedReason: null
  },

  // Honeypots Estruturais (H15 a H17)
  {
    id: "H15_HONEYPOT_TABINDEX_NEGATIVE_AND_HIDDEN",
    desc: "Honeypot estrutural: tabindex='-1' em controle escondido -> canWrite: false, HONEYPOT_DETECTED",
    build() {
      const { rows } = buildTableContext([{ text: "Mariana Lima" }]);
      rows[0].input.attributes['tabindex'] = '-1';
      rows[0].input.attributes['aria-hidden'] = 'true';
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "H16_HONEYPOT_AUTOCOMPLETE_OFF_OUTSIDE_STUDENT_ROW",
    desc: "Honeypot estrutural: autocomplete='off' em campo sem contexto de aluno -> canWrite: false, HONEYPOT_DETECTED",
    build() {
      const standalone = createNode({
        tagName: 'INPUT',
        attributes: { autocomplete: 'off' },
        rect: { left: 100, top: 100, width: 20, height: 20 }
      });
      return { el: standalone, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  },
  {
    id: "H17_HONEYPOT_DUPLICATE_INPUT_SAME_NAME_IN_ROW",
    desc: "Honeypot estrutural: input duplicado com o mesmo name na mesma linha de aluno -> canWrite: false, HONEYPOT_DETECTED",
    build() {
      const { rows } = buildTableContext([{
        text: "Mariana Lima",
        inputName: "presenca_check",
        extraInputs: [{ name: "presenca_check" }]
      }]);
      return { el: rows[0].input, student: "Mariana Lima" };
    },
    expectedCanWrite: false,
    expectedReason: "HONEYPOT_DETECTED"
  }
];

function runHardeningSuiteA() {
  let SafeWriter;
  try {
    SafeWriter = require(modulePath);
  } catch (err) {
    console.error(`[ERRO FATAL] Não foi possível carregar SafeWriter em ${modulePath}:`, err.message);
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log(`  AVALIAÇÃO DE ENDURECIMENTO DO SAFEWRITER — PARTE A (${HARDENING_CASES_A.length} CASOS)`);
  console.log("=======================================================\n");

  let passed = 0;
  let failures = [];

  for (let i = 0; i < HARDENING_CASES_A.length; i++) {
    const tc = HARDENING_CASES_A[i];
    const data = tc.build();
    let res;
    try {
      res = SafeWriter.canSafelyWrite(data.el, data.student, data.opts);
    } catch (err) {
      failures.push({ id: tc.id, desc: tc.desc, error: err.message });
      console.log(`[${String(i + 1).padStart(2, '0')}] ${tc.id}: FAIL (exceção: ${err.message})`);
      continue;
    }

    const matchesCanWrite = (res && res.canWrite === tc.expectedCanWrite);
    const matchesReason = (tc.expectedReason === null)
      ? (res.reason === null || res.reason === undefined)
      : (res.reason === tc.expectedReason);

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
  console.log(`  RESULTADO PARTE A: ${passed} aprovados, ${failures.length} falhos (de ${HARDENING_CASES_A.length})`);
  console.log(`  Falhas: ${failures.length}`);
  console.log("=======================================================\n");

  if (failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runHardeningSuiteA();
