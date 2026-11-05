# 🦉 Teacher AI — Sidecar Desktop (Browser Harness & CDP)

> ⚠️ **APOSENTADO — Fase 6 (nov/2026)**
>
> Este componente foi desativado. A automação de portais escolares agora roda
> exclusivamente pelo **app desktop Electron** em conjunto com a **extensão TeacherAI v3.1**
> (nativeMessaging). O sidecar Python não é mais iniciado nem necessário.
> O arquivo iniciar-sidecar.bat na raiz do projeto confirma esse status.
>
> O código está preservado para referência histórica. Não execute main.py.

---

## Histórico

Este componente era o worker local responsável por executar automações de navegador
em portais escolares (SED, Plurall, Machado Sobrinho, Rede Santa Catarina, Cambridge One, etc.)
utilizando **Chrome DevTools Protocol (CDP)** e **Playwright**.

A abordagem foi migrada para a extensão de browser (MV3) com 
ativeMessaging,
que não exige abrir o Chrome com porta de depuração nem manter um processo Python rodando.

---

## Arquivos relevantes (referência)

- sidecar/main.py — ponto de entrada (não executar)
- sidecar/extension_bridge.py — bridge com a extensão (não executar)
- sidecar/requirements.txt — dependências Python
- sidecar/tests/ — suíte de testes unitários (ainda útil para validar lógica portada)