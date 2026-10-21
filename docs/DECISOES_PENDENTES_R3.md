# 📋 Decisões Pedagógicas Pendentes para a Professora (Rodada R3)

Este documento registra três decisões conceituais e pedagógicas estritas que dependem da autorização e definição da professora (dona do produto), sem suposições arbitrárias de engenharia.

---

## 1. Gabarito dos 18 Turnos da Fixture `aula_50min_bio`

A suíte de testes calculou deterministicamente os tempos e turnos da aula de demonstração de Biologia (`aula_50min_bio`). A tabela abaixo apresenta a transcrição temporalizada bruta para homologação pedagógica:

| Turno | Início (s) | Fim (s) | Duração (s) | Falante | Pergunta Classificada | Espera (Wait-Time I) | Trecho da Fala
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **#00** | 0.0 | 65.0 | 65.0s | Professor | NÃO | - | *Bom dia a todos! Hoje vamos nos aprofundar nas relações tróficas...* |
| **#01** | 70.0 | 120.0 | 50.0s | Professor | NÃO | - | *Vimos na aula anterior que todo ecossistema depende do fluxo de energia...* |
| **#02** | 125.0 | 137.0 | 12.0s | Professor | **SIM (Docente)** | 6.5s | *Turma, como vocês explicariam o impacto na pirâmide se os produtores fossem reduzidos à metade?* |
| **#03** | 143.5 | 155.0 | 11.5s | Aluno (Arthur) | NÃO | - | *Professora, os herbívoros ficariam imediatamente sem alimento...* |
| **#04** | 158.0 | 170.0 | 12.0s | Professor | **SIM (Docente)** | 2.0s | *Muito bem articulado, Arthur! E as plantas são os únicos organismos autotróficos?* |
| **#05** | 172.0 | 180.0 | 8.0s | Aluno | NÃO | - | *Sim professora, porque elas produzem seu próprio alimento através do sol.* |
| **#06** | 250.0 | 262.0 | 12.0s | Aluno (Carlos) | **SIM (Discente)** | - | *Professora, o fluxo de energia sempre diminui a cada nível trófico?* |
| **#07** | 265.0 | 355.0 | 90.0s | Professor | NÃO | - | *Excelente pergunta, Carlos! O fluxo de energia é estritamente unidirecional...* |
| **#08** | 400.0 | 412.0 | 12.0s | Professor | **SIM (Docente)** | 5.5s | *Quem pode me dar um exemplo de consumidor terciário em biomas brasileiros?* |
| **#09** | 417.5 | 425.0 | 7.5s | Aluno | NÃO | - | *A onça-pintada se alimentando de um lobo-guará ou jacaré no Pantanal.* |
| **#10** | 500.0 | 512.0 | 12.0s | Aluno (Beatriz) | **SIM (Discente)** | - | *Professora, as bactérias nitrificantes do solo também contam como produtoras?* |
| **#11** | 515.0 | 560.0 | 45.0s | Professor | NÃO | - | *Sim, Beatriz! Elas produzem matéria orgânica a partir de energia química...* |
| **#12** | 600.0 | 650.0 | 50.0s | Professor | NÃO | - | *Agora vamos analisar o ciclo do nitrogênio e como ele interage com a cadeia alimentar...* |
| **#13** | 700.0 | 715.0 | 15.0s | Professor | **SIM (Docente)** | 3.0s | *Carlos, qual é o principal gás que compõe a nossa atmosfera?* |
| **#14** | 718.0 | 725.0 | 7.0s | Aluno (Carlos) | NÃO | - | *É o gás nitrogênio, cerca de 78% do ar.* |
| **#15** | 730.0 | 800.0 | 70.0s | Professor | **SIM (Docente)** | 2.0s | *Correto! E nós conseguimos absorver o nitrogênio diretamente pela respiração? Pensem na composição...* |
| **#16** | 802.0 | 810.0 | 8.0s | Aluno | NÃO | - | *Não, precisamos ingeri-lo através dos alimentos, como proteínas e vegetais.* |
| **#17** | 2900.0 | 2980.0 | 80.0s | Professor | NÃO | - | *Para nossa próxima aula, façam os exercícios da página 45 sobre ciclo do nitrogênio.* |

### Métricas Agregadas do Gabarito:
- **Tempo Docente:** 501.0s (88.4%)
- **Tempo Discente:** 66.0s (11.6%)
- **Total de Fala:** 567.0s (100.0%)
- **Perguntas do Professor:** 5 perguntas (Wait-Time I: Média 3.80s, Mediana 3.00s, Pausas $\ge$ 3s: 3/5 ou 60%)
- **Perguntas dos Alunos:** 2 perguntas

> **Pergunta 1 para a Professora:** O gabarito acima reflete fielmente a interpretação pedagógica esperada para esta aula? A classificação de 5 perguntas docentes e 2 discentes está homologada?

---

## 2. Casos 126 a 130: Checagem / Hipótese Discente vs Não-Pergunta

No dataset de desenvolvimento e histórico, cinco falas discentes estão marcadas como `expectedIsQuestion: false` na categoria `afirmacao_com_interrogacao`:

1. **ID 126:** *"a capital da Argentina é Buenos Aires?"*
2. **ID 127:** *"a fórmula da água oxigenada é H2O2?"*
3. **ID 128:** *"a resposta do cálculo deu quarenta e dois?"*
4. **ID 129:** *"o verbo está no pretérito perfeito?"*
5. **ID 130:** *"o sangue oxigenado passa pela aorta?"*

### O Dilema Pedagógico:
- **Interpretação A (Não-pergunta / Resposta hesitante):** O aluno está respondendo a uma pergunta prévia do professor, apenas expressando insegurança ou pedindo validação com entonação ascendente.
- **Interpretação B (Pergunta discente de checagem/confirmação):** O aluno está ativamente formulando uma hipótese e solicitando confirmação epistêmica à professora (*"Isso que pensei está correto?"*). Em muitas rubricas de engajamento discente, checagens de hipótese contam como intervenções ativas.

> **Pergunta 2 para a Professora:** Qual deve ser o padrão adotado pelo Teacher AI?
> - **Opção 1 (Manter conservador):** Continuam como `não-pergunta` (apenas interrogações que solicitam informação nova ou explicação contam como perguntas discentes).
> - **Opção 2 (Subtipo específico):** Criar a categoria `pergunta_checagem_hipotese`, computada em métricas de participação, mas separada de dúvidas conceituais abertas.

---

## 3. Medição de Wait-Time I no Turno 15 (Fala Expositiva Mista)

No **Turno #15**, a professora fala durante **70 segundos** (730.0s a 800.0s). O turno começa com feedback expositivo (*"Correto! E nós..."*), faz a pergunta no meio/fim (*"...conseguimos absorver o nitrogênio diretamente pela respiração? Pensem na composição..."*) e continua com instruções. O aluno responde no início do turno #16 (802.0s), havendo **2.0 segundos de silêncio entre o fim do turno 15 e o início do turno 16**.

### O Desafio de Engenharia e Fidelidade Científica:
A literatura de Mary Budd Rowe (1972, 1986) define o *Wait-Time I* estritamente como **o tempo de silêncio transcorrido imediatamente após a emissão da pergunta pelo professor até a primeira reação do aluno**.
Em transcrições segmentadas por turno (sem timestamps palavra por palavra), assumir o silêncio entre o final do turno do professor e o início do turno do aluno pode distorcer a métrica quando o professor faz uma explanação longa após a pergunta.

> **Pergunta 3 para a Professora:** Como o Teacher AI deve tratar turnos docentes longos com perguntas?
> - **Abordagem A (Padrão atual):** Medir o silêncio entre o final do turno docente e o início da resposta do aluno (2.0s).
> - **Abordagem B (Filtro de Validade):** Só calcular Wait-Time I para turnos de pergunta dedicados/curtos (ex: $\le 15$ segundos), marcando perguntas em turnos longos como *Wait-Time Não Mensurável sem Alinhamento Fonético*.
> - **Abordagem C (Exigência de Timestamp Palavra-a-Palavra):** Só habilitar cálculo de Wait-Time quando a transcrição ASR fornecer timestamps por token/palavra.
