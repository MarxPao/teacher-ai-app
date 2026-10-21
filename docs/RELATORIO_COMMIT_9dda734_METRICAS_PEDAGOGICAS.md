# Documentação do Commit 9dda734 — Camada de Métricas Pedagógicas Determinísticas com Selo ASR

## 1. Arquivos e Linhas Relevantes
- [`lib/conversationData/pedagogicalMetrics.ts:1-495`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/lib/conversationData/pedagogicalMetrics.ts#L1-L495): Módulo funcional puro que extrai métricas determinísticas auditáveis a partir de `SessionRecord`, `TurnRecord[]`, `EventRecord[]` e `SpeakerMapRecord[]`.
- [`__tests__/conversationData/pedagogicalMetrics.test.ts:1-250`](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/__tests__/conversationData/pedagogicalMetrics.test.ts#L1-L250): Suíte de testes unitários com 14 testes cobrindo TTT/STT, Wait-Time I, perguntas com Wilson e monólogos.

## 2. O que o "Selo ASR" Significa na Prática
- **Campo no Contrato:** Cada métrica implementa a interface genérica `MetricMeasurement<T>`, que possui obrigatoriamente a propriedade:
  `asRealValidationSeal: '[NÃO VALIDADO EM ASR REAL]' | '[VALIDADO EM ASR REAL]'`
- **Quando é Aplicado:** Aplicado como `[NÃO VALIDADO EM ASR REAL]` em todas as medições da plataforma, pois os dados atuais decorrem de transcrições textuais sintéticas ou importadas via arquivo, sem validação acústica direta contra áudio de sala de aula real.
- **Tratamento de Baixa Confiança:**
  - As contagens de perguntas carregam `uncertainty.type: 'estimated_range'`, onde o valor observado é estritamente o **limite inferior** ($\ge N$), acompanhado do intervalo provável derivado do Recall de Wilson do Holdout 4 ($77.8\%$ [IC 95%: $54.8\% - 91.0\%$]).
  - O Gate de Confiança pré-insight (`insightConfidenceGate.ts`) bloqueia emissão de hipóteses pedagógicas quando a confiança é baixa (sessões $< 5\text{ min}$, $< 5\text{ falas}$, dados demo ou hiatos $> 40\text{ min}$).

## 3. Métricas Calculadas e Conformidade com `definitions.ts`
1. **TTT / STT (Proporção de Fala):** Percentual de tempo falado pelo professor vs. alunos vs. outros. `turns.start_ms` e `turns.end_ms`.
2. **Taxa e Decomposição de Perguntas Docentes:** Total observado, taxa por minuto, quebra tripartite (conteúdo, checagem, administrativa) e formato aberto/fechado com selo `[NÃO VALIDADO]`.
3. **Wait-Time I (Tempo de Espera Pós-Pergunta):** Média aritmética, mediana, distribuição e quantidade de pausas deliberadas $\ge 3.0\text{s}$, utilizando exatamente a constante `DEFAULT_DELIBERATE_PAUSE_THRESHOLD_SECONDS = 3.0` de `definitions.ts`.
4. **Maior Monólogo Docente:** Turno contínuo mais longo do professor em segundos e sua posição na linha do tempo da aula.
5. **Dúvidas Discentes e Retorno:** Contagem de perguntas de alunos e detecção de dúvidas sem acolhimento/resposta docente subsequente nos 2 turnos seguintes.
6. **Taxa de Resposta Discente:** Percentual de perguntas docentes sucedidas por fala de aluno vs. auto-resposta pelo docente.

## 4. Comparação e Ausência de Divergências com `queryEngine.ts`
Auditoria comparativa entre `pedagogicalMetrics.ts` e `queryEngine.ts` sobre a fixture canônica `aula_50min_bio`:
- **Tempo Docente:** 501.0s (88.4%) em ambos os módulos.
- **Tempo Discente:** 66.0s (11.6%) em ambos os módulos.
- **Perguntas Docentes:** 5 perguntas observadas em ambos os módulos.
- **Wait-Time I Médio:** 3.8s (mediana 3.0s, 3 de 5 pausas $\ge 3.0\text{s}$) em ambos os módulos.
- **Maior Monólogo:** 90.0s (Turno #07) em ambos os módulos.
- **Conclusão:** **Zero divergência.** Ambos os módulos produzem resultados matematicamente idênticos.

## 5. Evidência Literal de Execução
```
 RUN  v3.2.7 C:/Users/rafae/Documents/antigravity/hopeful-bell

 ✓ __tests__/conversationData/pedagogicalMetrics.test.ts (14 tests) 66ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
