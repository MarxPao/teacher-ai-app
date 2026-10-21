# Exceções Documentadas do Contrato SkillGraph v2
- `lib/contracts/skillgraph/validate.ts`: Fallback para `TextEncoder` na checagem de tamanho quando `Buffer` inexiste no navegador (equivalente funcional exato a `Buffer.byteLength`).
