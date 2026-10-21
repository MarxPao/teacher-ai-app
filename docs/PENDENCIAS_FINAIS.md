# Relatório de Pendências Finais e Diretrizes de Governança

Este documento consolida as pendências, deliberações e limitações conhecidas após a conclusão da suíte `conversationData`, cofre local seguro e bloqueio de PII em nuvem (LGPD Trilho 1).

---

## Bloco 1: Decisões Pedagógicas e Científicas que DEPENDEM da Professora

1. **Validação de Limiares Pedagógicos (`[DEFINIÇÃO A VALIDAR (dono)]`)**:
   - **Wait-Time I (`rowe_1974_wait_time`)**: O limiar padrão de 3.0 segundos (ou 50% de pausas $\ge$ 3s) é descritivo. Cabe à professora definir se adota ou customiza esse limiar para aulas de línguas (L2) vs. ciências.
   - **Equilíbrio de Participação Discente (`gini_turnos_discentes`)**: O corte de coeficiente de Gini discente $\ge 0.45$ requer aprovação pedagógica quanto à aplicabilidade em turmas heterogêneas.
   - **Índice de Discriminação em Avaliações (`N_MIN_ITEM_DISCRIMINATION_ZDP`)**: O limiar mínimo de 15 alunos para cálculo de discriminação de itens (ZDP) em `lib/insights/assessmentInsightAdapter.ts` está parametrizável aguardando validação final.
2. **Conferência de Referências Bibliográficas em Fontes Primárias (`[REFERÊNCIA A CONFERIR (dona)]`)**:
   - **Rowe, M. B. (1974)**: Conferir artigo físico/digital: *Wait-time and rewards as instructional variables, their influence on language, logic, and fate control: Part one-wait-time. Journal of Research in Science Teaching, 11(2), 81-94*.
   - **Vygotsky, L. S. (1978)** / **Hattie, J. (2008)**: Revisão de citações formais marcadas nos catálogos de insights.
3. **Política de Retenção e Descarte do Cofre**:
   - Definição do período máximo de guarda de sessões e transcrições em disco local (ex.: 30, 90 ou 180 dias) e parametrização do expurgo automático com `VACUUM`.
4. **Termo de Consentimento e Governança LGPD**:
   - Aprovação do texto do banner e modal de consentimento informado exibido ao docente antes do início da captura de áudio ou importação de sessões.

---

## Bloco 2: Ações com Dados Reais que NÃO Devem Ser Feitas sem Autorização

1. **Rotação da Chave Supabase Anon Pública Exposta**:
   - A chave pública (`eyJhbGciOiJIUzI1Ni...`) encontrada em `lib/browserAutomationClient.ts` e `lib/supabaseAuth.ts` deve ser rotacionada no painel administrativo do Supabase pela dona do projeto.
2. **Auditoria e Expurgo de Linhas Legadas no Supabase Cloud**:
   - Caso existam registros prévios nas tabelas `students`, `private_students` ou `portal_execution_logs` no Supabase, a exclusão definitiva ou anonimização retroativa exige autorização expressa e execução manual com a `SERVICE_ROLE_KEY`.
3. **Calibração do Classificador com Áudio Escolar Real**:
   - Proibição absoluta de calibração contra datasets não autorizados. Qualquer ajuste futuro das regras do classificador de perguntas requer novo dataset com áudio real de sala de aula e consentimento formal.

---

## Bloco 3: Limitações Conhecidas do Sistema

1. **Classificador ASR Validado Exclusivamente em Texto Sintético**:
   - O classificador foi testado nos datasets sintéticos DEV2, DEV3 e Holdout 4 (40 falas inéditas em minúsculas e sem pontuação). **Não foi validado contra transcrições de áudio real de sala de aula**, o que significa que contagens de perguntas funcionam como estimativa e limite inferior.
2. **Atribuição de Falantes e Diarização**:
   - As métricas de tempo de fala discente vs. docente dependem da transcrição rotulada por speaker (`professor` / `aluno`). O modelo Whisper puro não realiza diarização nativa; a atribuição depende da interface de rotulagem do Desktop ou de motor auxiliar de diarização local.
3. **Cifragem de Nível de Aplicação no SQLite**:
   - O cofre cifra campos nominais (`text`, `speaker_label`, `title`, `diff`) com AES-GCM (`enc:v1:`). Metadados numéricos de contagem, tipo de evento e timestamps residem em claro no SQLite local para permitir agregações de alta velocidade sem vazamento de PII.
4. **Espelho Local de Write-Through**:
   - O desenho arquitetural do espelho local foi formalizado em `docs/DESENHO_ESPELHO_LOCAL.md`; a implementação física das tabelas de auditoria do Desktop Core deve ser realizada na etapa de empacotamento do app Electron.
