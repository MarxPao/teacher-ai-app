# 🔌 TEACHER??? – Extensão Agêntica para Chrome

Esta extensão Chrome transforma o navegador em um **agente inteligente** que preenche automaticamente formulários nos portais escolares que você usa diariamente.

## Portais Suportados

| Portal | URL | Status |
|---|---|---|
| 🏫 Machado Sobrinho | machadosobrinho.paineldoaluno.com.br | ✅ Ativo |
| 🔴 Rede Santa Catarina | portaleducacao.redesantacatarina.org.br | ✅ Ativo |
| 📗 Plural (SOMOS) | plural.net | ✅ Ativo |
| 🇬🇧 Cambridge One | cambridgeone.org | ✅ Ativo |
| 💼 Microsoft Teams | teams.microsoft.com | ✅ Ativo |

## Arquivos

```
teacher-extension/
├── manifest.json    # Configuração e permissões (Manifest V3)
├── content.js       # Script injetado nos portais — preenche campos
├── background.js    # Service worker — rota mensagens entre abas
├── popup.html       # Interface ao clicar no ícone do Chrome
└── popup.js         # Lógica do popup
```

## Como Instalar

1. Abra o Chrome e acesse: `chrome://extensions/`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione esta pasta (`teacher-extension/`)
5. O ícone 🧑‍🏫 aparecerá na barra do Chrome

## Como Usar

1. Abra o app TEACHER??? em `http://localhost:3000`
2. Acesse o módulo **Extensões** na barra lateral
3. Selecione uma tarefa do seu calendário
4. Clique em **Preencher Agênticamente** no portal desejado
5. Alterne para a aba do portal — os campos serão preenchidos automaticamente!

## Arquitetura de Comunicação

```
[TEACHER??? App] --postMessage--> [content.js] --> preenche campos
                                       ↕
                                [background.js] <--> [popup.js]
                                (rota entre abas)   (log + ações)
```

## Como Funciona o Preenchimento

A extensão usa **dois mecanismos complementares**:

1. **Seletores CSS específicos por plataforma** — otimizados para a estrutura DOM de cada portal
2. **Varredura semântica de palavras-chave** — fallback inteligente que procura campos por `id`, `name`, `placeholder` e `aria-label`

O preenchimento é compatível com React, Angular e Vue (dispara eventos nativos para atualizar o estado interno dos frameworks).
