# Mapeamento de Portal Escolar — Machado Sobrinho (paineldoaluno.com.br)

## 1. Identificação do Portal
- **Nome:** Machado Sobrinho
- **ID Interno:** `machado`
- **URL Base:** `https://machadosobrinho.paineldoaluno.com.br/professor_painel`
- **Domínio:** `paineldoaluno.com.br`
- **Tipo de Autenticação:** Login do professor com sessão persistida no Chrome (cookies/localStorage)

---

## 2. Roteiro de Inspeção Manual (Para a Professora / Usuário)

Como o login é pessoal e protegido por credenciais da professora, para calibrar os seletores finais com 100% de exatidão:

1. **Acessar a Lista de Alunos:**
   - Faça login no portal do Machado Sobrinho no Google Chrome.
   - Navegue até a tela onde a lista de alunos/turma é exibida (ex: *Diário de Classe*, *Frequência* ou *Lista de Alunos*).
2. **Inspecionar a Tabela (F12):**
   - Clique com o botão direito sobre o nome de um aluno e escolha **Inspecionar (Inspect)**.
   - Copie ou anote a estrutura da linha (`<tr>` ou `<div class="...">`).
   - Verifique se a matrícula do aluno aparece como atributo (ex: `data-id="12345"`, `class="matricula"` ou coluna separada).
3. **Verificar Paginação:**
   - A turma inteira aparece na mesma página ou existe paginação no rodapé (ex: `[1] [2] [3]` ou botão `Próximo >`)?
   - Se houver botão de próxima página, anote o seletor (ex: `.pagination .next` ou `button#btnProximo`).
4. **Verificar Seleção de Turma:**
   - Para mudar de turma, há um `<select name="turma">` ou um menu lateral?
5. **Verificar Informações Especiais (NEE / Inclusão):**
   - Há alguma coluna ou tag visual sinalizando alunos de inclusão/NEE nesta tela?

---

## 3. Estrutura Padrão Mapeada (Painel do Aluno / Genérica)

```yaml
roster_mapping:
  table_container: "table.tabela-alunos, table#listaAlunos, .grid-alunos"
  row_selector: "tbody tr, .aluno-item"
  columns:
    roll_number: "td:nth-child(1), .num-chamada"
    student_name: "td.nome, td:nth-child(2), .nome-aluno"
    portal_native_id: "td.matricula, td:nth-child(3), [data-matricula]"
    status: "td.situacao, .status-matricula"
    nee_flag: ".tag-inclusao, .badge-nee"
  pagination:
    type: "next_button"
    next_button_selector: ".pagination .next, a[rel='next'], button.btn-proxima-pagina"
    disabled_class: "disabled"
    max_pages: 10
  rate_limit:
    page_delay_ms: 1000
    safe_read_only: true
```

---

## 4. Diretrizes de Segurança para Leitura
- **Operação Exclusiva de Leitura:** Nenhuma submissão de formulário é executada.
- **Delay Defensivo:** 800ms a 1500ms entre cliques de paginação para evitar bloqueios por WAF/rate-limiting.
- **Interrupção Imediata:** Caso apareça desafio Cloudflare/CAPTCHA, a automação para e devolve o controle ao professor.
