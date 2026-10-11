# SkillGraph v2 Runner Harness (Painel de Teste Manual)

O Harness é uma aplicação local, sem React e sem dependência de extensão instalada, que executa o **SkillGraphRunner** determinístico diretamente sobre documentos DOM contidos em um `iframe`. Ele serve para validação visual passo a passo dos grafos v2 contra pegadinhas reais de portais educacionais.

---

## 1. Como Executar

### 1.1 Gerar o bundle do harness
Compila `tools/runner-harness/harness.ts` e suas dependências (`lib/runner/**`, `lib/runner-dom/**`, schemas e grafos sintéticos) com `esbuild`:
```bash
npm run harness:build
```

### 1.2 Iniciar o servidor HTTP local
Inicia o servidor HTTP estático nativo (`node:http`) em `127.0.0.1:8898`:
```bash
npm run harness
```

Abra no navegador:
```
http://127.0.0.1:8898/
```

---

## 2. Fixtures HTML (`tools/runner-harness/fixtures/`)

| Fixture | Descrição e Caso Testado |
| :--- | :--- |
| `standard.html` | Tabela clássica com matrícula, nome, status, nota e ações. Caso canônico de baseline. |
| `columns_reversed.html` | Colunas invertidas (ex.: nota antes do nome). Testa resiliência do mapeamento de âncoras por header em vez de índice fixo. |
| `footer_total.html` | Linhas inferiores de rodapé ("Total: 30 alunos", "Média: 7.5"). Valida a regra de `skip_rows` (`RowSkip`), garantindo que linhas não-dados sejam descartadas sem erro nem mutações indevidas. |
| `pagination.html` | Tabela dividida em múltiplas páginas com botão "Próxima". Testa nó `NAVIGATE` e paginação sequencial. |
| `virtualized.html` | Contêiner rolável com DOM virtualizado que renderiza apenas 10 linhas visíveis por vez. Testa primitivas de rolagem (`scroll_until_found`). |
| `diario_grid.html` | Grade estilo diário de classe (linhas = alunos, colunas = dias do mês). Testa localização de células em cruzamento de chaves (aluno x dia). |
| `reformatting_input.html` | Campo de entrada que reformata o valor ao disparar evento `blur` (ex.: digitou `7` e virou `07,00`). Valida que o write e pós-validação (read-back) consideram formatação sem falha espúria. |

---

## 3. Grafos Sintéticos v2 (`graphs/synthetic/`)

1. **`read_roster.json`**:
   - Lê a tabela de alunos na fixture.
   - Aplica `skip_rows` para ignorar linhas de rodapé / subtotais.
   - Salva a lista estruturada na variável `alunos`.
2. **`lancar_falta.json`**:
   - Itera (`LOOP` sobre `table_rows`) na tabela de alunos.
   - Aplica condição determinística (`BRANCH`) para identificar faltosos.
   - Marca checkbox ou botão de falta para alunos selecionados.
3. **`lancar_nota.json`**:
   - Itera sobre alunos preenchendo campo de nota (`WRITE`).
   - Executa read-back pós-escrita para confirmar que o valor foi registrado com sucesso.
   - Registra cada mutação no log de auditoria.

---

## 4. Recursos da Interface Visual

- **Árvore de Nós em Tempo Real**:
  - Cinza: não visitado (`pending`).
  - Azul pulsante: executando agora (`running`).
  - Verde: concluído com sucesso (`completed`), exibindo tempo de execução em milissegundos.
  - Vermelho: falha (`failed`), com mensagem e código de erro canônico.
  - Amarelo: pulado / fallback tomado (`skipped`).
- **Controle de Execução**:
  - `Executar`: executa o grafo continuamente.
  - `Passo a passo`: executa um único nó por vez, pausando automaticamente antes do próximo nó.
  - `Pausar / Retomar`: pausa ou retoma a execução a qualquer momento.
  - `Abortar`: interrompe imediatamente o motor com código `E_INTERRUPTED`.
  - `Limpar`: reseta a visualização e restaura o grafo selecionado.
- **Variáveis Vivas**:
  - Painel de inspeção de estado do runtime (`RunState.variables`).
  - Proteção LGPD: nomes de alunos são anonimizados (ex.: `Mariana L.`) e CPFs protegidos (`[CPF_PROTEGIDO]`).
- **Log de Auditoria**:
  - Registra toda operação de escrita arriscada (`WRITE`, `UPLOAD`, etc.), contendo valor anterior, novo valor e status (`success`, `reverted`).
- **Garantia de Motor Puro (Zero-Cost / Zero-LLM)**:
  - Rodapé com medidor fixo: `Chamadas de LLM: 0 | Requisições de rede: 0`.
- **Exportação de Trace**:
  - Botão `Exportar trace (JSON)` faz download do histórico completo de eventos (`RunEvent[]`), estados dos nós e variáveis para análise forense offline.
