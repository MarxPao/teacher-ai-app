# Política de Autorização e Governança de Testes contra Portais de Terceiros

**Versão:** 1.0 — Pré-Piloto  
**Status:** Vigente e Mandatória  
**Data:** 13 de Setembro de 2026  
**Escopo:** Teacher AI (Extensão do Chrome, Sidecar Python, Plataforma Web e Agentes Autônomos)

---

## 1. Princípio Fundamental e Base Legal

O Teacher AI tem como missão empoderar professoras e reduzir sua sobrecarga de trabalho burocrático. No entanto, o respeito à soberania dos sistemas escolares, à integridade dos dados acadêmicos e à legislação vigente (**Marco Civil da Internet — Lei 12.965/2014**, **LGPD — Lei 13.709/2018** e **Art. 154-A do Código Penal**) exige limites rígidos de governança.

> [!IMPORTANT]
> **REGRA MANDATÓRIA DE BLOQUEIO:**
> É **terminantemente proibido** executar testes de desenvolvimento, testes de carga, auditorias de grounding ou rotinas automatizadas contra portais escolares de produção pertencentes a terceiros **sem autorização expressa, prévia e por escrito da mantenedora ou direção escolar responsável**.

---

## 2. Auditoria Retroativa de Risco e Status Atual

### 2.1 Confirmação de Status Formal
- **Não existe autorização por escrito documentada** por parte do Colégio Machado Sobrinho (ou qualquer outra escola/rede externa) para a execução de automação contra seus sistemas de produção (`paineldoaluno.com.br`).
- Em decorrência desta constatação, **todos os testes contra portais externos em produção estão formalmente suspensos e bloqueados**.

### 2.2 Auditoria de Risco Retroativo
Revisamos todo o histórico de execuções e código-fonte do projeto para avaliar o impacto de interações passadas:

| Escopo / Componente | Natureza da Interação Histórica | Avaliação de Risco Retroativo | Status Atual |
|---|---|---|---|
| **Suíte de Testes do Sidecar (213 testes)** | 100% dos testes rodam em sandboxes locais isolados (`public/sandbox/*.html` e `file://`) | **Risco Zero** (nenhuma requisição enviada a servidores externos) | Mantido e protegido |
| **Suíte de Testes Vitest (545 testes)** | 100% de mocks em memória (`localhost:3000`, rotas simuladas) | **Risco Zero** (isolamento completo de rede) | Mantido e protegido |
| `sidecar/run_live_machado.py` | Execução exploratória pontual da Camada 2 via CDP na porta 9222 | **Baixo Risco**: Operação estritamente Read-Only (sem submissão de formulários, sem alteração de notas ou faltas no portal da escola). Dados não foram persistidos em bases externas. | **Desativado e Bloqueado** |
| `sidecar/cdp_connector.py` | Possuía URL de fallback para a página inicial do portal | **Baixo Risco**: Redirecionava a aba ativa caso estivesse em `about:blank`. | **Removido**: Fallback eliminado no código |

---

## 3. Diretrizes de Engenharia e Salvaguardas Técnicas

1. **Sandboxes como Padrão Inegociável:**
   - Todo desenvolvimento de descoberta de seletores, grounding semântico, tratamento de cascata e preenchimento de notas deve ser realizado exclusivamente contra páginas de sandbox locais (`public/sandbox/*.html`).
2. **Remoção de URLs Externas Hardcoded:**
   - Nenhum conector ou agente deve conter URLs de portais escolares de terceiros como destino padrão ou fallback de navegação.
3. **Trava de Segurança Institucional:**
   - Qualquer conexão a domínio não-local exigirá validação prévia de token institucional e termo de anuência assinado.

---

## 4. Requisitos para Início de Piloto com Escolas Parceiras

Antes de qualquer professora ou pesquisador ativar o Teacher AI em uma instituição parceira, o seguinte checklist documental deve ser concluído:

- [ ] **Termo de Autorização de Piloto Tecnológico:** Assinado pelo representante legal da escola.
- [ ] **Acordo de Tratamento de Dados (DPA - Data Processing Agreement):** Estabelecendo a escola como *Controladora* e o Teacher AI como *Operador* nos termos da LGPD.
- [ ] **Definição de Turmas Piloto:** Limitação do uso a turmas e disciplinas formalmente indicadas pela coordenação pedagógica.
- [ ] **Plano de Contingência:** Garantia de que a professora mantém controle total (Human-in-the-Loop) com homologação obrigatória antes de qualquer gravação definitiva no portal.
