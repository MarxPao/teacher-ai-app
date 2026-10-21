# Guia de Instalação e Execução — Teacher AI Desktop (v2)

Este documento descreve o procedimento canônico de compilação, registro e execução do **Teacher AI Desktop** e da **Extensão Chrome MV3** no ambiente de produção local-first.

---

## 1. Arquitetura e Princípios

- **Local-First:** Todo o processamento escolar, histórico de auditoria e armazenamento de credenciais ocorrem na máquina local do professor.
- **Zero Portas TCP:** Não há servidores HTTP, WebSocket ou portas abertas localmente. A extensão comunica-se com o aplicativo Electron exclusivamente via **Chrome Native Messaging (stdio binário)** pelo identificador `com.teacherai.desktop`.
- **Criptografia e Cofre:** O banco SQLite local é protegido com chaves derivadas do cofre do sistema operacional (Windows DPAPI / Credential Manager).

---

## 2. Pré-requisitos

- **Sistema Operacional:** Windows 10 ou 11 (64-bit).
- **Node.js:** Versão 20 LTS ou superior.
- **Navegador:** Google Chrome versão 110 ou superior.

---

## 3. Passo a Passo de Instalação e Execução

### Passo 1 — Compilar os Bundles do Motor e Desktop

No terminal do repositório, execute a geração dos bundles otimizados:

```powershell
# Compila o processo principal Electron, preload e shim de Native Messaging
npm run build:desktop

# Compila os bundles do runner, content-adapter e gravador DOM para a extensão
npm run build:ext
```

Artefatos gerados:
- `dist-desktop/main.js`, `dist-desktop/preload.js`, `dist-desktop/shim.bat`, `dist-desktop/ui/`
- `teacher-extension/dist/runner.bundle.js`
- `teacher-extension/dist/content-adapter.bundle.js`
- `teacher-extension/dist/recorder.bundle.js`

---

### Passo 2 — Registrar o Host de Chrome Native Messaging

O Chrome exige que hosts nativos estejam registrados na chave de registro do usuário (`HKCU`):

```powershell
npx tsx scripts/native-host-register.ts
```

Esse comando cria automaticamente o manifesto JSON com o caminho absoluto para `dist-desktop/shim.bat` e registra a entrada no Windows:
```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.teacherai.desktop
```

---

### Passo 3 — Carregar a Extensão no Google Chrome

1. Abra o Google Chrome e acesse `chrome://extensions/`.
2. Ative a chave **Modo do desenvolvedor** no canto superior direito.
3. Clique no botão **Carregar sem compactação** (*Load unpacked*).
4. Selecione o diretório:
   ```
   <raiz_do_projeto>\teacher-extension
   ```
5. Confirme que o ID da extensão coincide com a chave autorizada no manifesto nativo.

---

### Passo 4 — Iniciar o Aplicativo Desktop

Inicie o processo principal do aplicativo Electron:

```powershell
npm run desktop:dev
```

A janela do Teacher AI será exibida na bandeja do sistema / tela inicial, pronta para receber comandos de sincronização, compilação de grafos e auditoria.

---

## 4. Testes de Integridade e Verificação

Para confirmar que a ponte de Native Messaging está operante e rejeitando requisições inválidas ou sem formato correto:

```powershell
npx tsx scripts/nm-negative-test.ts
```

No Google Chrome:
1. Abra qualquer aba no portal escolar ou página de teste.
2. Abra o painel lateral do Teacher AI (ícone da extensão no Chrome).
3. Na aba **Suíte**, execute os testes de conformidade (**Rodar DEV**).

---

## 5. Limitações Conhecidas (Roadmap / Backlog)

- **Instalador NSIS Gráfico em Um Clique (.exe):**
  A geração de instalador autônomo sem uso de terminal requer a homologação do empacotador `electron-builder` e a configuração de certificado Authenticode para assinatura de código (evitando bloqueios por antivírus/SmartScreen). Atualmente registrado em `docs/BACKLOG.md`.
