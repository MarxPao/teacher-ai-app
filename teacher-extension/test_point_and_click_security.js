/**
 * test_point_and_click_security.js
 * 
 * Validação automatizada:
 * Garante que o modo de apontar/clicar da Teacher AI intercepta
 * fisicamente os eventos de clique através do overlay e NUNCA propaga
 * ou dispara cliques em botões, links ou formulários do portal da escola.
 */

const assert = require('assert');

// 1. Mock do ambiente DOM
class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.value = '';
    this.innerText = '';
    this.style = {};
    this.listeners = {};
    this.parentNode = null;
    this.children = [];
  }

  addEventListener(type, fn, options) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== fn);
  }

  dispatchEvent(evt) {
    evt.target = this;
    if (this.listeners[evt.type]) {
      for (const fn of this.listeners[evt.type]) {
        fn(evt);
        if (evt._stopped) break;
      }
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
    return child;
  }

  contains(el) {
    if (el === this) return true;
    return this.children.some(c => c.contains(el));
  }

  getBoundingClientRect() {
    return { top: 100, left: 200, width: 80, height: 30 };
  }
}

class MockEvent {
  constructor(type, bubbles = true) {
    this.type = type;
    this.bubbles = bubbles;
    this.clientX = 220;
    this.clientY = 110;
    this.defaultPrevented = false;
    this._stopped = false;
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() { this._stopped = true; }
}

const document = {
  body: new MockElement('body'),
  documentElement: new MockElement('html'),
  createElement(tag) {
    return new MockElement(tag);
  },
  elementFromPoint(x, y) {
    // Retorna o botão do portal quando o overlay estiver transparente
    return portalSubmitButton;
  }
};

global.document = document;
global.window = {};

// 2. Cria elementos simulados do portal da escola
const portalSubmitButton = new MockElement('button', 'btn-enviar-notas-portal', 'btn btn-primary');
portalSubmitButton.innerText = 'Enviar Notas Definitivas';
document.body.appendChild(portalSubmitButton);

let portalButtonClickCount = 0;
portalSubmitButton.addEventListener('click', (e) => {
  portalButtonClickCount++;
});

// 3. Carrega a função enablePointAndClickMode
const fs = require('fs');
const contentJsPath = require('path').resolve(__dirname, 'content.js');
const contentSource = fs.readFileSync(contentJsPath, 'utf8');

// Extrai e avalia a função enablePointAndClickMode do content.js
const fnStart = contentSource.indexOf('function enablePointAndClickMode');
const fnEnd = contentSource.indexOf('// Expõe globalmente para testes');
const fnCode = contentSource.substring(fnStart, fnEnd);
eval(fnCode);

// 4. Execução do Teste de Segurança
console.log('--- Iniciando Teste de Segurança: Overlay de Apontar/Clicar ---');

let callbackResult = null;
enablePointAndClickMode((data) => {
  callbackResult = data;
});

// Verifica se os elementos do overlay foram criados no DOM
const overlay = document.body.children.find(c => c.id === 'teacher-point-click-overlay');
const highlight = document.body.children.find(c => c.id === 'teacher-point-click-highlight');
const banner = document.body.children.find(c => c.id === 'teacher-point-click-banner');

assert(overlay, 'Overlay de interceptação deve estar inserido no body');
assert(highlight, 'Highlight box deve estar inserido no body');
assert(banner, 'Banner deve estar inserido no body');

// Simula a professora clicando na tela: o clique atinge o OVERLAY em tela cheia
const clickEvt = new MockEvent('click');
overlay.dispatchEvent(clickEvt);

// 5. Validações Críticas
// Regra A: O clique DEVE ser interceptado pelo overlay e cancelado
assert.strictEqual(clickEvt.defaultPrevented, true, 'O evento de clique deve ter defaultPrevented = true');
assert.strictEqual(clickEvt._stopped, true, 'O evento de clique deve ter propagação anulada');

// Regra B: O botão real do portal NUNCA deve receber o clique
assert.strictEqual(
  portalButtonClickCount,
  0,
  'FALHA DE SEGURANÇA: O botão real do portal recebeu um clique acidental durante o modo de apontar!'
);

// Regra C: O callback capturou os dados corretos do elemento para o SkillGraph
assert(callbackResult, 'Callback deve ter sido invocado');
assert.strictEqual(callbackResult.selected, true, 'Deve indicar selected: true');
assert.strictEqual(callbackResult.id, 'btn-enviar-notas-portal', 'Deve capturar o ID do elemento subjacente');
assert.strictEqual(callbackResult.tagName, 'button', 'Deve capturar a tag do elemento subjacente');
assert.strictEqual(callbackResult.selector, '#btn-enviar-notas-portal', 'Deve gerar seletor seguro');

// Regra D: Overlay e highlight foram removidos após o clique
assert.strictEqual(overlay.parentNode, null, 'Overlay deve ser removido do DOM após o clique');
assert.strictEqual(highlight.parentNode, null, 'Highlight deve ser removido do DOM após o clique');

console.log('✅ SUCESSO: O overlay interceptou 100% dos eventos. 0 cliques propagados para o portal.');
