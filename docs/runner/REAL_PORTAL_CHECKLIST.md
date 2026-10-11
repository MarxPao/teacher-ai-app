# Guia e Checklist de Testes no Portal Real (P3)

**Público:** Professor / Proprietário do Sistema  
**Objetivo:** Validar o ciclo de gravação e execução segura do Teacher AI no seu portal escolar de produção, com total segurança de dados e conformidade com a LGPD.

---

## 🛡️ Princípios de Segurança e Responsabilidade

> [!IMPORTANT]
> O assistente Teacher AI opera como uma extensão do seu próprio navegador. Todas as ações executadas no portal são de sua responsabilidade e utilizam a sua sessão autenticada. Respeite sempre os Termos de Uso da instituição de ensino.

1. **Conta Pessoal e Autenticada:** Utilize exclusivamente o seu login legítimo de professor. Nunca compartilhe senhas, tokens de sessão ou cookies.
2. **Ritmo Humano e Proteção contra Sobrecarga:** O motor executa ações com atrasos deliberados (`rate_limit: 500ms a 1500ms`) simulando a digitação humana para não sobrecarregar os servidores da escola.
3. **Desafios de Segurança (CAPTCHA / 2FA / Reconhecimento):** O Teacher AI **nunca tenta resolver, automatizar ou burlar** mecanismos de segurança institucional. Se um desafio surgir, a execução será pausada com o badge `PAUSA` no ícone da extensão para que você resolva na tela e clique em *Continuar*.

---

## 📋 Checklist Pré-Execução (Passo a Passo)

### Etapa 1: Comece Sempre por Somente-Leitura (`read_roster`)
- [ ] Abra o diário de classe da sua turma no portal escolar.
- [ ] Abra o Side Panel do Teacher AI e clique no botão **Gravar Demonstração**.
- [ ] Escolha a tarefa `read_roster` (Ler lista de alunos).
- [ ] Na página do portal, role a lista de alunos para que todos fiquem visíveis e clique no botão **Parar Gravação**.
- [ ] Na tela de **Revisão**, confirme que as colunas foram identificadas corretamente.
- [ ] Clique em **Compilar e Testar (Dry-Run)**.
- [ ] **Validação:** Verifique se o resultado lista a contagem correta de alunos da turma.

---

### Etapa 2: Gravação e Teste de Escrita com Proteção Máxima (`lancar_falta`)
- [ ] **Ambiente de Teste:** Sempre que possível, utilize uma turma de treinamento, disciplina fictícia ou uma aula de teste criada para homologação.
- [ ] **Teste Inicial com Dry-Run:**
  - Grave a marcação de presença/falta de 1 aluno de teste.
  - Na tela de revisão, marque a polaridade correta e habilite o **Checkpoint**.
  - Execute primeiro em **Modo Dry-Run**: o assistente simulará a localização do aluno e do campo, mas **não clicará nem alterará nada no portal**.
- [ ] **Teste de Rejeição de Checkpoint (Garantia de Não-Mutação):**
  - Execute o grafo em modo real.
  - Quando surgir o modal vermelho de confirmação na tela, clique em **Cancelar**.
  - **Verifique na página do portal:** O portal deve permanecer 100% inalterado (zero escritas aplicadas).
- [ ] **Teste de Execução Real com 1 Aluno:**
  - Execute e aprove o checkpoint no modal.
  - Confirme visualmente que o portal registrou a falta do aluno correto e que o read-back foi bem-sucedido.
  - Recomposição: Desfaça a alteração de teste no portal se necessário.

---

### Etapa 3: Auditoria LGPD antes de Compartilhar Arquivos

> [!CAUTION]
> **DADOS DE ALUNOS NUNCA DEVEM SAIR DO SEU COMPUTADOR!**  
> Antes de compartilhar qualquer trace, log ou arquivo JSON gerado pelo sistema:

- [ ] **Inspeção de Texto:** Abra o arquivo gerado (trace JSON ou grafo) em um editor de texto.
- [ ] **Busca por Nomes:** Pressione `Ctrl + F` e busque pelos nomes de alunos da sua turma. O arquivo **não deve conter** nenhum nome real (devem aparecer apenas rótulos mascarados como `Aluno 1`, `Mariana L.` ou dados fictícios).
- [ ] **Busca por Documentos:** Busque por padrões de CPF ou matrículas reais. Certifique-se de que estão ausentes ou mascarados (`[CPF_PROTEGIDO]`).
- [ ] Se algum dado pessoal não mascarado for encontrado, **NÃO COMPARTILHE O ARQUIVO** e registre o achado como apontamento de segurança.

---

## 📊 Classificação Honesta do Nível de Suporte (Tier)

Ao concluir os testes, classifique o seu portal escolar segundo os critérios objetivos:

- **Tier 1 (Pleno / Autônomo):** Gravou uma vez, compilou sem ajustes manuais complexos e executou com sucesso tanto em dry-run quanto na submissão real.
- **Tier 2 (Assistido / Guiado):** O portal possui formulários estritos ou variações que exigiram intervenção humana durante a revisão (ex.: ajuste fino de polaridade ou handoff de login/desafio).
- **Tier 3 (Restrito / Somente Leitura):** O portal suporta apenas a leitura do roster (`read_roster`) ou exportação de relatórios, bloqueando automação de escrita devido a restrições de arquitetura.

Preencha o laudo estruturado utilizando o modelo em [`docs/runner/PORTAL_REPORT_TEMPLATE.md`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/docs/runner/PORTAL_REPORT_TEMPLATE.md).
