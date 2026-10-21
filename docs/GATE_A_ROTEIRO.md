# Roteiro de Execução do Gate A — Teacher AI (SkillGraph v2)

Este roteiro é o guia prático passo a passo para o **dono do projeto** realizar a validação ponta a ponta do Gate A.
Tempo estimado de execução: **~60 minutos**.

---

## Orientações Gerais de Integridade
1. **Quem executa os testes manuais e anota os resultados:** O dono do projeto. O assistente não simula nem preenche resultados de execução com navegador real aberto.
2. **Ambiente:** Chrome com a extensão desempacotada, app Electron local e servidor harness local.
3. **Registro de Falhas:** Caso encontre qualquer erro ou divergência, anote no [Modelo de Relato de Falhas](#modelo-de-relato-de-falhas) no fim deste documento e envie na conversa.

---

## Passo 1: Preparação do Ambiente e Inicialização

### Comandos no Terminal
Abra o PowerShell na raiz do repositório (`c:\Users\rafae\Documents\antigravity\hopeful-bell`) e execute os comandos abaixo na ordem:

```powershell
# 1.1 Compilar os bundles da extensão
npm run build:ext

# 1.2 Compilar o app desktop
npm run desktop:build

# 1.3 Executar o pré-voo de verificação
npm run gate:preflight

# 1.4 Registrar o Native Messaging Host no registro do Windows (HKCU)
npx tsx scripts/native-host-register.ts --register

# 1.5 Subir o servidor de teste sintético (harness) em segundo plano ou em outro terminal
npm run harness

# 1.6 Iniciar o aplicativo desktop
npm run desktop:dev
```

### Carregar a Extensão no Google Chrome
1. Abra o Google Chrome e acesse `chrome://extensions/`.
2. No canto superior direito, ative a chave **"Modo do desenvolvedor"**.
3. Clique no botão **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta `teacher-extension` do projeto.
5. Verifique que o ID da extensão gerado é: `phahliidgjidilhkcllbhfjmjcefdfci`.
6. Abra o ícone da extensão no navegador para exibir o painel lateral (**Side Panel — Motor v2**).

### Resultado Esperado do Passo 1
- O comando `npm run gate:preflight` exibe `[OK]` em todos os itens e termina com código 0.
- O portal sintético responde normalmente em `http://127.0.0.1:8898`.
- A janela do app Electron abre exibindo o painel Teacher AI.
- O side panel da extensão abre exibindo as abas: **Runner**, **Gravar** e **Suíte**.

---

## Passo 2: Gravação do Fluxo de Leitura (`read_roster`)

### Ações
1. No Chrome, abra a URL do portal sintético:
   `http://127.0.0.1:8898/fixtures/standard.html`
2. No painel da extensão, clique na aba **"Gravar"**.
3. Selecione o tipo de fluxo: **Ler Lista de Alunos (read_roster)**.
4. Clique em **"Iniciar Gravação"**.
5. No portal, clique sobre a tabela de alunos e seus campos (matrícula, nome, turma).
6. Defina as opções de polaridade e escala se solicitado pela interface.
7. Clique em **"Parar e Compilar Gravação"**.
8. Clique em **"Verificar (Dry-Run)"** para testar a leitura em modo de simulação.
9. Clique no botão **"Salvar e Ativar Mapa ✨"**.
10. Olhe para a janela do aplicativo desktop.

### Resultado Esperado do Passo 2
- A gravação compila um grafo determinístico válido sem erros de linter.
- O dry-run lê as linhas da tabela sem alterar nada no portal.
- O mapa é enviado ao desktop app via host nativo e aparece registrado como **Versão 1**.

---

## Passo 3: Execução de Leitura Determinística (`read_roster`)

### Ações
1. Permaneça na página `http://127.0.0.1:8898/fixtures/standard.html`.
2. No painel da extensão, clique na aba **"Runner"**.
3. Selecione a opção **Ler Lista de Alunos (read_roster)**.
4. Clique no botão **"Executar"**.
5. Acompanhe a barra de progresso no painel da extensão e os dados exibidos no aplicativo desktop.

### Resultado Esperado do Passo 3
- A execução conclui com sucesso com indicador verde.
- Sem chamadas de LLM e sem requisições externas de rede (contador LLM: 0, Rede do runner: 0).
- Os alunos (ex.: Alice Souza, Bob Santos) são exibidos no painel do aplicativo desktop com as matrículas corretas.

---

## Passo 4: Fluxo de Escrita com Ponto de Controle Humano (`lancar_falta`)

### Ações
1. No portal `http://127.0.0.1:8898/fixtures/standard.html`, observe a coluna "Falta".
2. No painel da extensão, selecione o grafo **Lançar Presença/Falta (lancar_falta)**.
3. **Teste 4A — Dry-Run:**
   - Execute em modo Dry-run (ou teste de validação).
   - Verifique que **nenhum** checkbox de falta foi marcado na página real.
4. **Teste 4B — Execução Real com Aprovação:**
   - Clique em **"Executar"**.
   - O modal `⚠️ Ponto de Controle (Checkpoint)` deve abrir imediatamente na tela da extensão.
   - Verifique o resumo da ação apresentada no modal.
   - Clique em **"Confirmar e Executar"**.
   - Verifique a página: o checkbox de falta deve ter sido marcado.
5. **Teste 4C — Execução Real com Rejeição:**
   - Desmarque o checkbox manualmente para restaurar o estado.
   - Clique em **"Executar"** novamente.
   - Quando o modal de Checkpoint surgir, clique em **"Cancelar / Abortar"**.
   - Verifique a página: **nenhuma** alteração deve ser escrita (zero escrita).
6. No aplicativo desktop, abra a tela de Auditoria.

### Resultado Esperado do Passo 4
- O dry-run não altera o DOM.
- A execução com aprovação só escreve após o clique humano no botão de confirmação.
- A rejeição do checkpoint aborta imediatamente com zero escrita.
- A auditoria no desktop exibe o registro com o diff exato `before → after`, carimbo de data/hora e status de confirmação humana.

---

## Passo 5: Teste Decisivo de Segurança (Fail-Closed com App Fechado)

> [!IMPORTANT]
> Este é o teste mais crítico de segurança da arquitetura. Ele prova que a extensão é incapaz de executar escritas desgovernadas se o aplicativo central não estiver ativo para auditar e autorizar.

### Ações
1. **Feche completamente** o aplicativo Electron (`Teacher AI Desktop`). Certifique-se de que a janela foi encerrada.
2. No Chrome, na página do portal, tente executar o fluxo real **lancar_falta** pelo painel da extensão.
3. Observe o comportamento do painel e do portal.
4. Anote a mensagem de erro exata exibida no painel.

### Resultado Esperado do Passo 5
- A extensão **deve abortar imediatamente** sem tentar escrever ou contornar a ausência do app.
- Nenhum campo ou checkbox é modificado no portal (zero escrita).
- Mensagem de erro esperada no painel: indicação clara de host nativo indisponível (`E_HOST_UNAVAILABLE` ou falha de conexão com host nativo).

---

## Passo 6: Mutação de Layout e Resiliência (Auto-Reparo Assistido)

### Ações
1. Reabra o app desktop (`npm run desktop:dev`).
2. No Chrome, acesse a página simulando uma mutação de layout no portal:
   `http://127.0.0.1:8898/fixtures/standard.html?mut=class_change`
3. No painel da extensão, tente executar o fluxo **read_roster** ou **lancar_falta**.
4. Observe o surgimento do card de reparo no painel da extensão.
5. Clique em **"Aplicar Atualização ✨"**.
6. Execute o fluxo novamente.
7. No aplicativo desktop, visualize o histórico de versões do mapa e teste o botão de reverter (rollback) para a **Versão 1**.

### Resultado Esperado do Passo 6
- O motor detecta que os seletores originais quebraram devido à mutação.
- O card `sgv2-repair-box` é exibido: *"O portal mudou um botão ou campo. O assistente localizou uma atualização segura. Deseja aplicar?"*.
- Ao aprovar, o sistema gera e salva a **Versão 2** do mapa.
- A execução funciona perfeitamente na página com a mutação.
- A reversão para a Versão 1 restaura o estado anterior com sucesso no app desktop.

---

## Passo 7: Governança de Mapas (Exportação, Quarentena e Ativação)

### Ações
1. No aplicativo desktop:
   - Acesse os mapas salvos e clique em **Exportar Mapa**.
   - Salve o arquivo JSON resultante.
2. Inicie o app com outro diretório de dados (ou use a opção de importar mapa novo).
3. Importe o arquivo JSON gerado.
4. Verifique o status inicial do mapa importado (deve estar em **QUARENTENA** / inativo).
5. Vincule o host autorizado (`allowed_hosts`).
6. **Teste de Quarentena:** Tente disparar uma execução antes de ativar o mapa.
7. Ative explicitamente o mapa no aplicativo.
8. Execute a tarefa novamente.

### Resultado Esperado do Passo 7
- O mapa importado entra compulsoriamente em **Quarentena**.
- Qualquer tentativa de execução em quarentena é bloqueada com erro (`E_MAP_INACTIVE` / mapa não ativado) e zero escrita.
- Após a ativação explícita pelo usuário, a execução ocorre normalmente.

---

## Passo 8: Varreduras Finais de Privacidade, Portas e HOLDOUTs

### Comandos no Terminal
Execute os comandos de auditoria automatizada:

```powershell
# 8.1 Varredura de privacidade (PII e segredos)
npm run privacy:scan

# 8.2 Varredura de portas e conexões de rede
npm run privacy:scan -- --ports

# 8.3 Suíte de conformidade com cenários holdout
npx tsx scripts/community/conformance-run.ts --set holdout
```

### Validação na Extensão (Painel v2)
1. Abra a aba **"Suíte"** no painel da extensão.
2. Clique no botão **"Rodar HOLDOUT"**.
3. Observe os resultados cenário a cenário na tabela.
4. Verifique se os contadores de LLM e Rede permanecem em zero durante toda a suíte.

### Registro Final
- Abra o arquivo `docs/GATE_RESULTS.md`.
- **O dono do projeto deve preencher** os números reais colhidos (testes aprovados, falhas, tempos e observações).

---

## Modelo de Relato de Falhas

Se qualquer passo falhar ou apresentar comportamento divergente do esperado, copie a tabela abaixo, preencha e cole na conversa:

```markdown
### Relato de Falha no Gate A

| Passo | O que fiz | Mensagem / Erro Exibido | Console do Service Worker (sem PII de aluno) |
| :---: | :--- | :--- | :--- |
| Ex: 5 | Fechei o app e cliquei em Lançar Falta | [Descrever mensagem na tela] | [Colar log relevante sem nomes ou CPFs] |
| ...   | ...  | ... | ... |
```
