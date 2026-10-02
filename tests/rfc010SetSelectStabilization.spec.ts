/**
 * @vitest-environment jsdom
 *
 * tests/rfc010SetSelectStabilization.spec.ts
 *
 * Validação rigorosa do RFC-010:
 * 1. Re-resolução dinâmica de nós live (getLiveSelect) pós-mutação/re-render;
 * 2. Rejeição ativa a leituras transitórias de read_back_index = -1;
 * 3. Estabilização por double-requestAnimationFrame e janela de settle;
 * 4. Isolamento estrito de escopo (form vs global_nav).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Carrega content.js em ambiente Node/jsdom
const content = require('../teacher-extension/content.js');
const {
  handlePortalObserve,
  handlePortalSetSelect,
  getLiveSelect,
  getOrAssignRef,
  findElementByRef
} = content;

describe('RFC-010 — Estabilização e Re-resolução Dinâmica de Selects', () => {
  beforeEach(() => {
    // Configura polyfill seguro de requestAnimationFrame se necessário em jsdom
    if (typeof window.requestAnimationFrame !== 'function') {
      window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number;
    }

    const fixturePath = path.resolve(__dirname, 'fixtures/portal-form.html');
    const html = fs.readFileSync(fixturePath, 'utf-8');
    document.body.innerHTML = html;
  });

  it('1. handlePortalObserve registra refs estáveis e mapeia metadados de escopo', () => {
    const obs = handlePortalObserve('form:form_diario_frequencia');
    expect(obs.ok).toBe(true);
    expect(obs.elements.length).toBeGreaterThan(0);

    const turmaSelectMeta = obs.elements.find((el: any) => el.id === 'turma');
    expect(turmaSelectMeta).toBeDefined();
    expect(turmaSelectMeta.role).toBe('native_select');
    expect(turmaSelectMeta.scope).toBe('form:form_diario_frequencia');
    expect(turmaSelectMeta.ref).toMatch(/^ref_\d+$/);

    // O elemento físico no DOM deve possuir o atributo data-teacher-ref
    const domEl = document.getElementById('turma');
    expect(domEl?.getAttribute('data-teacher-ref')).toBe(turmaSelectMeta.ref);
  });

  it('2. handlePortalSetSelect executa mutação física e verifica readback em DOM estável', async () => {
    const obs = handlePortalObserve('form:form_diario_frequencia');
    const turma = obs.elements.find((el: any) => el.id === 'turma');

    // Seleciona a opção 1 ("6º Ano A - Fundamental II")
    const result = await handlePortalSetSelect(turma.ref, 1);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('verified');
    expect(result.requested).toBe(1);
    expect(result.read_back.index).toBe(1);
    expect(result.read_back.text).toContain('6º Ano A - Fundamental II');
    expect(result.evidence).toContain('selectedIndex alterado');
  });

  it('3. RFC-010 V3: Re-resolução dinâmica de elemento (getLiveSelect) quando nó é substituído no DOM', async () => {
    const obs = handlePortalObserve('form:form_diario_frequencia');
    const turmaMeta = obs.elements.find((el: any) => el.id === 'turma');
    const oldNode = document.getElementById('turma') as HTMLSelectElement;
    expect(oldNode).not.toBeNull();

    // Simula portal legado substituindo o nó <select id="turma"> por AJAX durante o onchange
    oldNode.addEventListener('change', () => {
      const parent = oldNode.parentElement!;
      parent.removeChild(oldNode);

      const newNode = document.createElement('select');
      newNode.id = 'turma';
      newNode.name = 'turma';
      newNode.setAttribute('data-teacher-ref', turmaMeta.ref);

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.text = '-- Selecione a Turma --';
      const opt1 = document.createElement('option');
      opt1.value = '101';
      opt1.text = '7º Ano Fundamental';
      newNode.appendChild(opt0);
      newNode.appendChild(opt1);

      newNode.selectedIndex = 1;
      parent.appendChild(newNode);
    });

    // Dispara a seleção
    const result = await handlePortalSetSelect(turmaMeta.ref, 1);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('verified');
    expect(result.requested).toBe(1);
    expect(result.read_back.index).toBe(1);
    expect(result.read_back.text).toBe('7º Ano Fundamental');

    // Prova que o nó antigo está desconectado e o live é o novo nó
    expect(oldNode.isConnected).toBe(false);
    const liveResolved = getLiveSelect(turmaMeta.ref, oldNode);
    expect(liveResolved).not.toBeNull();
    expect(liveResolved.isConnected).toBe(true);
    expect(liveResolved).not.toBe(oldNode);
  });

  it('4. RFC-010 V2: Rejeição ativa a -1 transitório (reconstrução de opções em cascata)', async () => {
    const obs = handlePortalObserve('form:form_diario_frequencia');
    const turmaMeta = obs.elements.find((el: any) => el.id === 'turma');
    const selectTurma = document.getElementById('turma') as HTMLSelectElement;

    // Simula comportamento do portal real:
    // No change, o portal esvazia as opções por 80ms (selectedIndex fica -1) antes de restabelecer
    selectTurma.addEventListener('change', () => {
      // Força estado transitório -1
      selectTurma.selectedIndex = -1;

      setTimeout(() => {
        // Restabelece a opção selecionada após 80ms
        selectTurma.selectedIndex = 1;
      }, 80);
    });

    const result = await handlePortalSetSelect(turmaMeta.ref, 1);

    // O teste NÃO pode falhar com EMISMATCH ou read_back_index = -1
    expect(result.ok).toBe(true);
    expect(result.status).toBe('verified');
    expect(result.read_back.index).toBe(1);
    expect(result.read_back.index).not.toBe(-1);
  });

  it('5. Isolamento de escopo: getLiveSelect respeita container do form e não confunde com menu global', () => {
    // Insere select homônimo no cabeçalho global
    const header = document.createElement('header');
    header.innerHTML = '<select id="turma" name="turma"><option>Menu Global Turma</option></select>';
    document.body.insertBefore(header, document.body.firstChild);

    const obs = handlePortalObserve('form:form_diario_frequencia');
    const formTurma = obs.elements.find((el: any) => el.id === 'turma');

    // Desconecta o select do form para forçar re-resolução
    const formSelect = document.querySelector('form#form_diario_frequencia select#turma') as HTMLSelectElement;
    formSelect.remove();

    // Cria novo select dentro do form
    const formContainer = document.getElementById('form_diario_frequencia')!;
    const newFormSelect = document.createElement('select');
    newFormSelect.id = 'turma';
    newFormSelect.name = 'turma';
    formContainer.appendChild(newFormSelect);

    const resolved = getLiveSelect(formTurma.ref, formSelect);
    expect(resolved).toBe(newFormSelect);
    expect(resolved.closest('header')).toBeNull();
    expect(resolved.closest('form')?.id).toBe('form_diario_frequencia');
  });
});
