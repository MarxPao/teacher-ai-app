# Decisões Pendentes da Professora (Rodada R4)

Este documento detalha em linguagem pedagógica clara e acolhedora as 5 decisões e alinhamentos pendentes de validação pela professora Rafaela (proprietária do produto Teacher AI), identificadas durante a auditoria técnica da Rodada R4.

---

## 1. Conferência Manual dos 18 Turnos da Fixture de Biologia (`aula_50min_bio`)

- **Contexto Pedagógico:**
  Para garantir que as análises de conversação em sala de aula (tempo de fala docente versus discente, perguntas de sondagem e reflexão) sejam rigorosas e justas, foi criado um teste matemático independente (`__tests__/conversationData/fixtureArithmeticManual.test.ts`) que analisa os 18 turnos cronometrados brutos da aula modelo de Biologia (50 minutos sobre Cadeias Alimentares e Ciclos Biogeoquímicos).
- **Métricas Apuradas pelo Gabarito Determinístico:**
  - **Tempo de Fala Docente (Professora Helena):** 501,0s (88,4% do tempo de fala).
  - **Tempo de Fala Discente (Arthur, Beatriz, Carlos):** 66,0s (11,6% do tempo de fala).
  - **Total de Tempo Falado:** 567,0s (9 minutos e 27 segundos de fala ativa ao longo dos 50 minutos de aula).
  - **Perguntas Feitas pela Professora:** 5 perguntas (Turnos #02, #04, #08, #13 e #15).
  - **Pausa Média para Resposta dos Alunos (Wait-Time I):** Média de 3,8 segundos (mediana de 3,0 segundos). 3 das 5 perguntas tiveram pausas $\ge 3,0$ segundos (60%).
  - **Perguntas Autônomas dos Alunos:** 2 perguntas espontâneas de conteúdo (Turnos #06 e #10).
- **Status Técnico:** Marcado com a tag canônica `[CONFERÊNCIA MANUAL PENDENTE (dona)]`.
- **Decisão Solicitada à Professora:**
  1. Confirmar se a contagem de 5 perguntas docentes e 2 perguntas discentes corresponde à sua intenção didática ao criar a aula modelo.
  2. Avaliar se o equilíbrio de 88,4% de fala expositiva docente reflete a fase introdutória planejada para a explicação teórica daquele conteúdo.

---

## 2. Dataset DEV3 e Trava Criptográfica no `holdout.lock`

- **Contexto Pedagógico:**
  O classificador de falas da sala de aula precisa entender a linguagem oral espontânea dos alunos (que costuma chegar transcrita pelo microfone sem pontuação, sem letras maiúsculas e com gírias ou contrações, no padrão ASR). Para isso, foi elaborado o conjunto de dados `dev3Dataset.ts` com 40 falas.
- **Dilema de Integridade:**
  O arquivo `lib/conversationData/dev3Dataset.ts` existe no repositório com o hash SHA-256 `c8799cb9b81f62f253c8289886a5ae005bee137b4f6df97e72a9166e8c0284b2`, mas esse hash **não** foi adicionado ao arquivo de integridade `lib/conversationData/holdout.lock`. Em auditorias de IA, nunca se deve alterar um arquivo de trava criptográfica sem o consentimento do dono, pois isso poderia mascarar um benchmark "queimado" (usado durante os ajustes do modelo).
- **Decisão Solicitada à Professora:**
  1. **Opção A (Congelar DEV3):** Adicionar formalmente o hash do DEV3 ao `holdout.lock` como dataset de diagnóstico contínuo de ASR.
  2. **Opção B (Substituir por Amostras Reais):** Deixar o `dev3Dataset.ts` apenas como teste auxiliar e aguardar a gravação de áudios reais de sala de aula com autorização pedagógica para compor o próximo benchmark oficial.

---

## 3. Avaliação da Pausa de Espera (Wait-Time) no Turno #15 (730s – 800s)

- **Contexto Pedagógico:**
  Na pesquisa de Mary Budd Rowe sobre dinâmica de sala de aula, o *Wait-Time I* (tempo de espera que o professor concede entre o término de sua pergunta e a resposta do estudante) deve idealmente ser de no mínimo 3,0 segundos para promover pensamento complexo, formulação de hipóteses e maior participação de estudantes tímidos.
- **O que Ocorre no Turno #15:**
  No turno #15, a professora Helena diz: *"Correto! E nós conseguimos absorver o nitrogênio diretamente do ar?"*. A pergunta termina aos 800,0s, e o aluno responde no turno #16 aos 802,0s (tempo de pausa = 2,0 segundos).
- **Decisão Solicitada à Professora:**
  1. **Tolerância Pedagógica em Recall:** Considerar 2,0 segundos aceitável para perguntas de recordação factual imediata (respostas de sim/não ou fatos memorizados), reservando o limiar estrito de 3,0 segundos apenas para perguntas abertas de análise e inferência.
  2. **Rigor Universal:** Manter a recomendação de $\ge 3,0$ segundos para todas as intervenções docentes como princípio de escuta atenta, sem exceções.

---

## 4. Aprovação e Execução do Plano de Expurgo de Dados na Nuvem

- **Contexto de Privacidade e LGPD:**
  Para blindar a escola e a privacidade dos estudantes, o Teacher AI adotou uma política de **trilho duplo**: dados de alunos (nomes, notas individuais, fotos e relatórios de observação) vivem **exclusivamente no banco de dados local cifrado** no computador da professora (Desktop Core SQLite com chave DPAPI).
  Na nuvem (Supabase), só devem transitar dados estruturais sem PII (templates de provas, rubricas pedagógicas vazias, documentos e logs de contagem anônimos).
- **Artefatos Produzidos:**
  - `docs/INVENTARIO_PII_NUVEM.md`: Tabela com 22 pontos de contato, mapeando onde dados de alunos trafegavam historicamente.
  - `scripts/sql/expurgo_pii_alunos.sql`: Script SQL cirúrgico que cria tabelas de quarentena temporária para backup de segurança e em seguida remove com segurança os dados de identificação das tabelas de nuvem.
  - `docs/PLANO_EXPURGO_NUVEM.md`: Checklist passo a passo de como rodar o script.
- **Salvaguarda de Segurança:** O script **NÃO FOI EXECUTADO** e nenhuma linha do banco foi apagada pelo assistente.
- **Decisão Solicitada à Professora:**
  - Analisar o documento `docs/PLANO_EXPURGO_NUVEM.md` e autorizar a execução manual do script SQL no painel de controle do Supabase após a confirmação do backup local seguro.

---

## 5. Limiar Amostral do Gate de ZDP ($n < 8$) e Salvaguarda de Texto Livre

- **Contexto Psicométrico e Pedagógico:**
  A inferência sobre a Zona de Desenvolvimento Proximal (ZDP) de Vygotsky para itens de avaliação baseia-se na discriminação psicométrica da questão (questões em que alunos com desempenho mediano necessitam de mediação do professor). Para que essa estatística seja válida e não gere falsos diagnósticos, o limiar padrão foi definido em $n \ge 8$ alunos respondentes, com a marcação `[DEFINIÇÃO A VALIDAR (dono)]`.
- **Implementação Realizada no Adapter:**
  - Se a turma tem menos de 8 alunos ($n < 8$), qualquer insight rotulado formalmente como ZDP (`category: 'zdp'` ou inferência explícita de discriminação de item em ZDP) é descartado (*fail-closed*), evitando apresentar conclusões estatisticamente frágeis à professora.
  - Por outro lado, menções meramente conceituais ou descritivas gerais (ex.: *"atividades de revisão auxiliam no avanço da zona de desenvolvimento proximal"*) **não são bloqueadas**.
- **Decisão Solicitada à Professora:**
  1. Confirmar se o limiar mínimo de 8 estudantes atende às turmas regulares da sua escola.
  2. Definir se para turmas reduzidas (ex.: reforço pedagógico, AEE ou salas com 4 a 7 alunos) o sistema deve permitir o insight acompanhado de uma etiqueta visual amarela de ressalva (*"Amostra reduzida: indicativo preliminar"*), em vez de suprimir completamente o card.
