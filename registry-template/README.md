# 🌐 Registro Comunitário de Mapas — Teacher AI

Este repositório estático serve como índice público descentralizado para compartilhamento de mapas de automação pedagógica (`SkillGraphV2`) entre educadores.

---

## 🔒 Princípios de Segurança e Privacidade

1. **Zero Dados Pessoais:** Nenhum dado de aluno, professor ou identificador de escola (nomes, e-mails, domínios reais) é aceito neste registro.
2. **Placeholders Obrigatórios:** Todos os endereços de portal devem utilizar marcadores padronizados (`h1.invalid`, `h2.invalid`).
3. **Assinatura Ed25519 Mandatória:** Cada pacote submetido deve ser criptograficamente assinado com a chave privada do seu autor.
4. **Quarentena por Padrão:** O aplicativo Teacher AI Desktop coloca todo mapa baixado em quarentena estrita até aprovação manual da professora após simulação prévia (dry-run).

---

## 📦 Como Submeter um Novo Mapa

1. No aplicativo desktop Teacher AI, exporte o mapa gravado via menu **Comunidade > Exportar Mapa**. O aplicativo automaticamente sanitizará dados pessoais e gerará o arquivo `.skillpkg.json` assinado.
2. Crie um fork deste repositório.
3. Adicione o arquivo `.skillpkg.json` na pasta `packages/`.
4. Atualize o arquivo `index.json` adicionando a entrada correspondente com o hash SHA-256 do pacote.
5. Abra um Pull Request. A esteira automatizada (`.github/workflows/verify-pr.yml`) executará a validação formal de segurança.

---

## ⚖️ Política de Revisão e Revogação

- **Chaves Revogadas:** Pacotes de chaves comprometidas ou maliciosas são adicionados à lista `revoked_keys` do índice, sendo imediatamente bloqueados nos aplicativos das professoras.
- **Licenciamento:** Apenas pacotes sob licença aberta permissiva (`CC0-1.0` ou `CC-BY-4.0`) são aceitos.
