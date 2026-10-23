// scripts/run-e2e-chromium.ts
// Compila e executa a suíte E2E em motor Chromium real (Electron 34 Blink/V8 + CDP nativo)

import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'dist-desktop')

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  // 1. Empacota o DomDriver + DOM Distiller + Self-Healing para injeção no contexto Blink da janela Chromium
  const pageBundleResult = await build({
    stdin: {
      contents: `
        import { DomDriver } from './lib/runner-dom/driver';
        import { installClosedShadowRootHook } from './lib/runner-dom/selectors';
        import {
          distillInteractiveDom,
          decomposeCompoundTeacherCommand,
          selectBestDistilledAction,
        } from './lib/explorer/domDistiller';
        import { createDriftSnapshot, generateRepairProposal } from './lib/repair';
        installClosedShadowRootHook();
        (window as any).__TeacherAIE2E = {
          DomDriver,
          installClosedShadowRootHook,
          distillInteractiveDom,
          decomposeCompoundTeacherCommand,
          selectBestDistilledAction,
          createDriftSnapshot,
          generateRepairProposal,
        };
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
  })
  const pageBundleCode = pageBundleResult.outputFiles[0].text
  const pageBundlePath = path.join(OUT_DIR, 'e2e-page-bundle.js')
  fs.writeFileSync(pageBundlePath, pageBundleCode, 'utf8')

  // 2. Gera o runner do processo principal do Electron (Chromium 132 + webContents.debugger CDP)
  const electronRunnerPath = path.join(OUT_DIR, 'e2e-electron-main.cjs')
  const fixturePath = path.join(ROOT, 'tools', 'runner-harness', 'fixtures', 'hostile-portal-e2e.html')

  const electronMainSource = `
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');

app.disableHardwareAcceleration();

function assert(cond, msg) {
  if (!cond) throw new Error('E2E_ASSERTION_FAILED: ' + msg);
}

app.whenReady().then(async () => {
  const html = fs.readFileSync(${JSON.stringify(fixturePath)}, 'utf8');
  const bundleJs = fs.readFileSync(${JSON.stringify(pageBundlePath)}, 'utf8');

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  const iframeHtml = \`<!DOCTYPE html>
<html><body>
  <button id="btn-iframe-xorigin" type="button">Lançar no Iframe Cross-Origin</button>
  <script>
    window.__iframeClicked = false;
    document.getElementById('btn-iframe-xorigin').addEventListener('click', () => {
      window.__iframeClicked = true;
    });
  </script>
</body></html>\`;

  const xoriginServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(iframeHtml);
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await new Promise(r => xoriginServer.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const xoriginPort = xoriginServer.address().port;

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    await win.loadURL('http://127.0.0.1:' + port + '/notas');
    await win.webContents.executeJavaScript(bundleJs);

    // E2E 1 a 8 (exceto 5 CDP e 6b Cross-Origin Frame): Executa dentro do motor Blink/V8 real do Chromium
    const domResults = await win.webContents.executeJavaScript(\`
      (async () => {
        const {
          DomDriver,
          distillInteractiveDom,
          decomposeCompoundTeacherCommand,
          selectBestDistilledAction,
          createDriftSnapshot,
          generateRepairProposal,
        } = window.__TeacherAIE2E;
        const driver = new DomDriver(document, ['127.0.0.1', 'localhost']);

        // (1) Auto-fechamento de Toast por elementFromPoint real do Blink
        const clickRes = await driver.click({
          anchor: {
            description: 'Botão Abrir Diário',
            candidates: [{ strategy: 'css', selector: '#btn-diario', score: 1 }],
          },
        });

        // (2) Calendário Flatpickr real com <select> de 12 meses + #ui-datepicker-div oculto (0x0)
        const calRes = await driver.write({
          target: {
            anchor: {
              description: 'Data da Aula',
              candidates: [{ strategy: 'css', selector: '#input-data-aula', score: 1 }],
            },
          },
          value: '2026-08-15',
          method: 'set_value',
        });

        // (3) Select2 portaled no document.body com busca dinâmica em .select2-search__field
        const s2Res = await driver.write({
          target: {
            anchor: {
              description: 'Seleção de Bimestre',
              candidates: [{ strategy: 'css', selector: '#select-bimestre', score: 1 }],
            },
          },
          value: '3º Bimestre',
          method: 'select_option',
        });

        // (4) AG-Grid com Colunas Fixadas à Esquerda + Centro (join por row-index) + Scroll Virtual + Homônimos
        const tableRes = await driver.readTable({
          anchor: {
            description: 'Grid de Notas AG-Grid',
            candidates: [{ strategy: 'css', selector: '#grid-notas', score: 1 }],
          },
          columns: {
            aluno: { header_labels: ['Aluno'], match: 'normalized' },
            nota: { header_labels: ['Nota'], match: 'normalized' },
          },
        });

        // (5) Coordenadas reais de #input-trusted-only e #btn-trusted-only
        const inputBox = await driver.getBoundingBox({
          anchor: {
            description: 'Input Trusted',
            candidates: [{ strategy: 'css', selector: '#input-trusted-only', score: 1 }],
          },
        });
        const btnBox = await driver.getBoundingBox({
          anchor: {
            description: 'Botão Trusted',
            candidates: [{ strategy: 'css', selector: '#btn-trusted-only', score: 1 }],
          },
        });

        // (6a) Closed Shadow DOM (attachShadow({ mode: 'closed' })) interceptado pelo hook real
        const shadowHost = document.getElementById('closed-shadow-host');
        const closedRoot = shadowHost.attachShadow({ mode: 'closed' });
        const shadowBtn = document.createElement('button');
        shadowBtn.id = 'btn-closed-shadow';
        shadowBtn.type = 'button';
        shadowBtn.textContent = 'Salvar no Shadow Fechado';
        shadowBtn.addEventListener('click', () => {
          window.__e2eState.closedShadowClicked = true;
        });
        closedRoot.appendChild(shadowBtn);

        const shadowClickRes = await driver.click({
          anchor: {
            description: 'Botão em Closed Shadow DOM',
            candidates: [{ strategy: 'css', selector: '#btn-closed-shadow', score: 1 }],
          },
        });

        // (7) Decomposição NLU Multi-Turno + Destilação DOM sem PII + Anti-Loop Backtracking
        const decomposed = decomposeCompoundTeacherCommand(
          'Abra a turma 6A, filtre 3º Bimestre e lance falta para Mariana Lima'
        );
        const distilled = distillInteractiveDom(document);
        const visitedStates = new Set();
        const clickedSels = new Set();
        const action1 = selectBestDistilledAction(distilled, 'Gravar Lançamento', visitedStates, clickedSels);
        if (action1 && action1.selected) clickedSels.add(action1.selected.selector);
        const actionAfterVisit = selectBestDistilledAction(distilled, 'Gravar Lançamento', visitedStates, clickedSels);

        // (8) Self-Healing: Seletor antigo #btn-salvar-antigo quebrado -> repara para #btn-gravar-lancamento ("Gravar Lançamento")
        const brokenLoc = await driver.locateAnchor({
          description: 'Botão Salvar Lançamento',
          candidates: [{ strategy: 'css', selector: '#btn-salvar-antigo-removido', score: 1 }],
        });
        const observedPool = await driver.describeElements('button, [role="button"]');
        const driftSnap = createDriftSnapshot({
          graphId: 'portal_e2e',
          graphVersion: 1,
          nodeId: 'node_salvar',
          url: window.location.href,
          expectedDescriptor: { tag: 'button', role: 'button', text: 'Salvar Lançamento', classes: ['btn-action'] },
          observedPool,
        });
        const repairProp = generateRepairProposal(driftSnap);
        const healedCandidates = repairProp.topCandidates[0]?.proposedAnchorCandidates || [];
        const healedClickRes = await driver.click({
          anchor: {
            description: 'Botão Reparado via Self-Healing',
            candidates: healedCandidates,
          },
        });

        return {
          clickRes,
          toastDismissed: window.__e2eState.toastDismissed,
          diarioClicked: window.__e2eState.diarioClicked,
          calRes,
          s2Res,
          tableRows: tableRes.rows,
          inputBox,
          btnBox,
          shadowClickRes,
          closedShadowClicked: window.__e2eState.closedShadowClicked,
          decomposed,
          distilledCount: distilled.elements.length,
          stateHash: distilled.stateHash,
          action1Id: action1 && action1.selected ? action1.selected.selector : null,
          actionAfterVisitId: actionAfterVisit && actionAfterVisit.selected ? actionAfterVisit.selected.selector : null,
          brokenMatchCount: brokenLoc.matchCount,
          healedClickRes,
          selfHealedClicked: window.__e2eState.selfHealedClicked,
        };
      })()
    \`);

    assert(domResults.clickRes.success === true, 'clickRes.success deve ser true');
    assert(domResults.toastDismissed === true, 'Toast obstrutivo deve ser fechado via elementFromPoint real');
    assert(domResults.diarioClicked === true, 'Botão #btn-diario deve receber o clique após fechar o toast');
    assert(domResults.calRes.verified === true, 'Flatpickr deve confirmar a data 15/08/2026');
    assert(domResults.calRes.afterValue === '15/08/2026', 'Flatpickr afterValue deve ser 15/08/2026, obtido: ' + domResults.calRes.afterValue);
    assert(domResults.s2Res.verified === true, 'Select2 portaled deve selecionar 3º Bimestre');
    assert(domResults.tableRows.length === 4, 'AG-Grid Pinned + Virtual Scroll deve retornar 4 linhas (incluindo 2 homônimos), obtido: ' + domResults.tableRows.length);
    assert(
      JSON.stringify(domResults.tableRows.map(r => r['Aluno'])) === JSON.stringify(['Ana Clara', 'Maria Silva', 'Maria Silva', 'Carlos Eduardo']),
      'Ordem das linhas do AG-Grid incorreta: ' + JSON.stringify(domResults.tableRows)
    );
    assert(
      JSON.stringify(domResults.tableRows.map(r => r['Nota'])) === JSON.stringify(['9.5', '8.0', '8.0', '10.0']),
      'Join de coluna Nota no AG-Grid incorreto: ' + JSON.stringify(domResults.tableRows)
    );
    assert(domResults.shadowClickRes.success === true && domResults.closedShadowClicked === true, 'Closed Shadow DOM deve ser perfurado e clicado no Chromium');
    assert(
      domResults.decomposed.taskIntent === 'lancar_falta' &&
      domResults.decomposed.filters.length === 2 &&
      domResults.decomposed.entities.aluno === 'Mariana Lima',
      'Decompositor NLU deve extrair taskIntent=lancar_falta, 2 filtros (6A, 3º Bimestre) e Mariana Lima: ' + JSON.stringify(domResults.decomposed)
    );
    assert(domResults.distilledCount >= 5 && domResults.stateHash.length === 8, 'DOM Distiller deve gerar elementos e stateHash de 8 chars');
    assert(domResults.action1Id === '#btn-gravar-lancamento', 'DOM Distiller deve selecionar #btn-gravar-lancamento, obtido: ' + domResults.action1Id);
    assert(domResults.actionAfterVisitId !== '#btn-gravar-lancamento', 'Anti-Loop Backtracking deve evitar repetir o elemento já clicado');
    assert(domResults.brokenMatchCount === 0 && domResults.healedClickRes.success === true && domResults.selfHealedClicked === true, 'Self-Healing deve reparar o seletor quebrado e clicar em #btn-gravar-lancamento');

    // (6b) Cross-Origin Iframe real (http://localhost:xoriginPort dentro de http://127.0.0.1:port)
    await win.webContents.executeJavaScript(\`
      new Promise((resolve) => {
        const ifr = document.getElementById('xorigin-frame');
        ifr.onload = () => resolve(true);
        ifr.src = 'http://localhost:\${xoriginPort}/iframe';
      })
    \`);
    const childFrames = win.webContents.mainFrame.frames;
    assert(childFrames.length === 1, 'Deve existir 1 childFrame Cross-Origin carregado');
    await childFrames[0].executeJavaScript(bundleJs);
    const xoriginClicked = await childFrames[0].executeJavaScript(\`
      (async () => {
        const { DomDriver } = window.__TeacherAIE2E;
        const fDriver = new DomDriver(document, ['localhost', '127.0.0.1']);
        await fDriver.click({
          anchor: {
            description: 'Botão Cross-Origin Iframe',
            candidates: [{ strategy: 'css', selector: '#btn-iframe-xorigin', score: 1 }],
          },
        });
        return window.__iframeClicked === true;
      })()
    \`);
    assert(xoriginClicked === true, 'DomDriver deve clicar com sucesso dentro do iframe Cross-Origin via frame routing');

    // E2E 5: Executa Hardware Input via Chromium DevTools Protocol (CDP 1.3) provando event.isTrusted === true
    win.webContents.debugger.attach('1.3');
    const ix = Math.round(domResults.inputBox.x + domResults.inputBox.width / 2);
    const iy = Math.round(domResults.inputBox.y + domResults.inputBox.height / 2);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: ix, y: iy, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ix, y: iy, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.insertText', { text: 'NOTA_10_CDP' });

    const bx = Math.round(domResults.btnBox.x + domResults.btnBox.width / 2);
    const by = Math.round(domResults.btnBox.y + domResults.btnBox.height / 2);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx, y: by });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', clickCount: 1 });
    win.webContents.debugger.detach();

    const cdpVerify = await win.webContents.executeJavaScript('window.__e2eState');
    assert(cdpVerify.trustedInputValue === 'NOTA_10_CDP', 'CDP Input.insertText deve disparar beforeinput com isTrusted=true: ' + cdpVerify.trustedInputValue);
    assert(cdpVerify.trustedClickReceived === true, 'CDP Input.dispatchMouseEvent deve disparar click com isTrusted=true');

    console.log('[E2E CHROMIUM REAL] 8/8 suítes aprovadas (1:Blink elementFromPoint, 2:Flatpickr <select>, 3:Select2 Portal, 4:AG-Grid Pinned+VirtualScroll, 5:CDP isTrusted=true, 6:Closed Shadow DOM + Cross-Origin Iframe, 7:NLU Multi-Turno + DOM Distiller + Backtracking, 8:Self-Healing AST)');
    server.close();
    xoriginServer.close();
    app.exit(0);
  } catch (err) {
    console.error('[E2E CHROMIUM REAL] FALHA:', err && err.stack ? err.stack : err);
    server.close();
    xoriginServer.close();
    app.exit(1);
  }
});
`
  fs.writeFileSync(electronRunnerPath, electronMainSource, 'utf8')

  // 3. Executa o binário real do Electron limpando ELECTRON_RUN_AS_NODE caso esteja setado no ambiente pai
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronBin: string = require('electron') as unknown as string
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const res = spawnSync(electronBin, [electronRunnerPath], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })

  if (res.status !== 0) {
    process.exit(res.status || 1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
