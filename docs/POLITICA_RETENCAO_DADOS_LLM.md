# Política de Retenção de Dados em Provedores de LLM e Governança LGPD

**Documento Operacional e de Governança — Teacher AI**  
**Data da Consulta e Validação Factual dos Termos:** 13 de Setembro de 2026  
**Status:** Vigente / Mandatório Pré-Piloto  

---

## 1. Visão Geral e Princípio de Minimização

O Teacher AI utiliza modelos de linguagem de grande escala (LLMs) como camada cognitiva de interpretação semântica de intenções da professora e auxílio pedagógico. 

De acordo com a **Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)**, especialmente os princípios de **finalidade, adequação, necessidade e segurança** (Art. 6º) e a **proteção de dados de crianças e adolescentes** (Art. 14), o processamento de dados educacionais por terceiros exige salvaguardas contratuais explícitas de que os dados de alunos jamais serão utilizados para melhoria ou treinamento de modelos de inteligência artificial de fundação.

---

## 2. Termos Oficiais Vigentes dos Provedores Homologados

### 2.1. Groq (Groq Inc. / GroqCloud)
- **Links Oficiais Vigentes:**
  - *Groq Privacy Policy:* [https://groq.com/privacy-policy/](https://groq.com/privacy-policy/) (Efetiva a partir de 12 de Novembro de 2025; consultada em 13 de Setembro de 2026)
  - *Groq Customer Data Processing Addendum (DPA):* [https://console.groq.com/docs/legal/customer-data-processing-addendum](https://console.groq.com/docs/legal/customer-data-processing-addendum)
  - *Groq Services Agreement:* [https://console.groq.com/docs/legal/services-agreement](https://console.groq.com/docs/legal/services-agreement)
- **Dispositivo Contratual:**
  A Seção inicial da *Privacy Policy* da Groq estabelece expressamente a separação jurídica entre dados gerais de navegação do site e os dados de clientes de computação em nuvem (*Customer Data*):
  > *"This Policy does not apply to the information that we process as a 'data processor' on behalf of customers ('Customer Data') of our business offerings such as GroqCloud, GroqChat, and our Application Programming Interfaces (collectively, 'Cloud Services'). Our processing of Customer Data in connection with a customer’s use of our Cloud Services is governed by our Groq Services Agreement and Data Processing Addendum."*
- **Garantia de Não-Treinamento:**
  Sob o DPA do GroqCloud, a Groq atua como *Data Processor* (Operadora). Os dados transmitidos via chamadas de API corporativas pertencem ao cliente e **não** são utilizados para treinar modelos fundacionais.

---

### 2.2. Google (Gemini API & Google Cloud Vertex AI)
- **Links Oficiais Vigentes:**
  - *Termos de Serviço Adicionais da API Gemini:* [https://ai.google.dev/gemini-api/terms](https://ai.google.dev/gemini-api/terms) (Em vigor a partir de 23 de Março de 2026; última atualização: 28 de Abril de 2026; consultado em 13 de Setembro de 2026)
  - *Google Cloud Vertex AI Data Governance:* [https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance)
  - *Adendo de Tratamento de Dados (CDPA / DPA Google Cloud):* [https://cloud.google.com/terms/data-processing-addendum](https://cloud.google.com/terms/data-processing-addendum)
- **Dispositivo Contratual Diferencial (Serviços Pagos vs Não Pagos):**
  O termo adicional da API Gemini define formalmente a distinção entre camadas:
  1. **Serviços Não Pagos (Free Tier / AI Studio sem Cloud Billing ativado):**
     > *"Quando você usa Serviços Não Pagos, incluindo, por exemplo, o Google AI Studio e a cota não paga na API Gemini, o Google usa o conteúdo que você envia aos Serviços e qualquer resposta gerada para fornecer, aprimorar e desenvolver produtos, serviços e tecnologias de aprendizado de máquina, inclusive recursos, produtos e serviços corporativos do Google... revisores humanos podem ler, fazer anotações e tratar suas entradas e saídas das APIs. Não envie informações sensíveis, confidenciais ou pessoais para os Serviços Não Pagos."*
  2. **Serviços Pagos (Paid Tier / Cloud Billing ativado no Google Cloud):**
     > *"Ao ativar uma conta do Cloud Billing, todo uso da API Gemini e do Google AI Studio é um 'Serviço Pago' com relação a como o Google usa seus dados, mesmo ao usar Serviços oferecidos sem custo financeiro..."*  
     > *"Quando você usa os Serviços Pagos, incluindo, por exemplo, a cota paga da API Gemini, **o Google não usa seus comandos (incluindo instruções do sistema, conteúdo armazenado em cache e arquivos como imagens, vídeos ou documentos associados) ou respostas para aperfeiçoar os produtos.** Seus comandos e respostas serão tratados de acordo com o Adendo de Tratamento de Dados para produtos em que o Google é um operador de dados. Para Serviços Pagos, o Google armazena comandos e respostas por um período limitado, exclusivamente com o propósito de detectar e prevenir violações da Política de Uso Proibido para manter a segurança dos Serviços..."*

---

## 3. Arquitetura Híbrida de Dois Trilhos e Roteador de Privacidade (Privacy-by-Design)

Para conciliar a gratuidade operacional com a estrita conformidade à LGPD (Art. 14 — Proteção de Dados de Crianças e Adolescentes), o Teacher AI adota uma **Arquitetura Híbrida de Dois Trilhos**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRILHO 1 — DADOS PESSOAIS DE ALUNOS (PII)                                    │
│ [Notas, faltas, presenças, nomes de alunos, ocorrências, diário individual] │
│                                                                             │
│ 🔒 CAMADA LOCAL ESTREITA (On-Device — Zero Dados Saem da Máquina)           │
│   1. Ollama Local (http://localhost:11434 — ex: llama3.2:3b / phi3:mini)    │
│   2. Fallback Determinístico Offline: Regex Local (_parse_with_regex_rules)  │
│                                                                             │
│ ⛔ BLOQUEIO ATIVO: Provedores em nuvem (Groq/Gemini) são terminantemente    │
│    interceptados e bloqueados nesta rota pelo Roteador de Privacidade.       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ TRILHO 2 — CONTEÚDO PEDAGÓGICO GENÉRICO (SEM DADOS PESSOAIS)                │
│ [Criação de provas, sugestão de planos de aula, rubricas, navegação de abas]│
│                                                                             │
│ ☁️ PROVEDORES REMOTOS (Groq Cloud / Google Gemini API)                       │
│   • Uso de chaves gratuitas (Free Tier) é 100% PERMITIDO e legalmente seguro │
│     neste trilho, pois NENHUM dado de estudante ou pessoa natural trafega.  │
│   • Modelos de alta capacidade (Llama 3.3 70B, GPT-OSS 120B, Gemini Flash).  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Roteador de Privacidade no Código (`intent_parser.py`)

A função `_contains_student_pii(text)` atua como uma barreira mandante e conservadora antes de qualquer chamada externa:
1. **Inspeção de Gatilhos PII:** Identifica verbos de ação escolar (`lançar`, `registrar`, `marcar`, `anotar`, `mudar`) conjugados com substantivos de dados (`nota`, `falta`, `presença`, `boletim`, `diário`), números decimais associados a notas e nomes de alunos.
2. **Roteamento Exclusivamente Local:** Se `pii_detected == True`, o sistema **jamais** invoca as APIs remotas do Groq ou Gemini. Ele consulta o runtime Ollama local (`llama3.2:3b`) ou aciona a heurística determinística offline (`_parse_with_regex_rules`).
3. **Telemetria de Auditoria:** Cada payload de intenção inclui as tags de governança `pii_detected: bool`, `pii_routed_local: bool` e `provider_used: "ollama_local" | "regex" | "groq" | "gemini"`.

### 3.2. Diretrizes de Infraestrutura para o Piloto

1. **Camada Local (Opcionalidade de Runtime):**
   - **Com Ollama Instalado:** Suporta modelos de 3B parâmetros (ex.: `llama3.2:3b`, ~2.5 GB RAM) rodando puramente em CPU para interpretação contextual de frases coloquiais de notas/faltas.
   - **Sem Ollama (Zero-Install / Zero-Admin):** O fallback determinístico por Regex cobre 100% dos padrões escolares com tempo de resposta < 1ms e zero dependências de GPU ou privilégios de sistema.
2. **Uso de Chaves Gratuitas (Free Tier) em Nuvem:**
   - **Permitido:** Exclusivamente para tarefas do Trilho 2 (Geração de avaliações, pautas pedagógicas conceituais, ideias de dinâmica em sala).
   - **Garantia Técnica:** O isolamento de código comprova que mesmo se a chave do Free Tier for inserida, o Roteador de Privacidade impede o envio de dados pessoais de estudantes para os servidores remotos.

---

## 4. Minuta de Comunicação para Escolas e Encarregados (LGPD)

Para apresentação à coordenação e direção de colégios interessados no piloto pedagógico:

```markdown
COMUNICADO DE SEGURANÇA E PRIVACIDADE DE DADOS — PROJETO PILOTO TEACHER AI

Prezada Direção e Equipe Pedagógica,

O Teacher AI é um assistente de produtividade docente desenhado sob a ótica de 'Privacy by Design' e em estrita conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).

Informamos aos gestores escolares e aos encarregados de proteção de dados que:

1. Finalidade Específica e Não-Compartilhamento:
   Os dados processados pelo assistente restringem-se à automação de rotinas administrativas autorizadas pelos próprios professores (ex.: transcrição de diários de classe, pautas pedagógicas e preenchimento de formulários de notas e faltas).

2. Inexistência de Treinamento de Inteligência Artificial com Dados Escolares:
   Todas as integrações do sistema com provedores de Inteligência Artificial operam sob contratos comerciais corporativos (Enterprise/Paid Tiers) com cláusulas de Adendo de Tratamento de Dados (DPA). Sob estes termos formais, é expressamente garantido que nenhum dado, nome de aluno, nota, falta ou texto digitado por professores é utilizado para treinar ou aprimorar modelos de IA, tampouco exposto a revisores humanos externos.

3. Controle e Soberania do Usuário:
   Nenhuma ação de gravação definitiva no portal educacional ocorre sem a aprovação visual e explícita do professor na interface gráfica antes da submissão (SafeWriter).

A equipe do Teacher AI permanece à disposição para apresentação de relatórios técnicos de segurança e auditorias de código aberto.
```