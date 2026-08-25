# 🦉 Teacher AI — Sidecar Desktop (Browser Harness & CDP)

Este componente é o worker local responsável por executar automações de navegador em portais escolares (SED, Plurall, Machado Sobrinho, Rede Santa Catarina, Cambridge One, etc.) utilizando **Chrome DevTools Protocol (CDP)** e **Playwright**.

---

## 🔒 Princípios de Segurança & Privacidade
1. **100% Local:** O Sidecar roda exclusivamente no computador do professor.
2. **Zero Senhas no App:** Conecta-se à sessão do Google Chrome já aberta e autenticada pelo próprio professor.
3. **Confirmação Humana Obrigatória:** Nenhuma submissão ou gravação de notas ocorre sem aprovação prévia no `<AutomationDiffModal />`.
4. **Log de Auditoria Imutável:** Todas as alterações geram registros de *before_state*, *after_state*, diff e screenshot no Supabase com RLS.

---

## 🚀 Como Iniciar

### 1. Iniciar o Google Chrome com a Porta de Depuração Ativa
Feche todas as instâncias do Chrome e abra via terminal:

**Windows:**
```powershell
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\ChromeProfile"
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"
```

---

### 2. Instalar Dependências do Sidecar
```bash
cd sidecar
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
playwright install chromium
```

---

### 3. Executar o Sidecar
```bash
python main.py
```

O terminal exibirá o banner e aguardará as solicitações de espelhamento iniciadas no Teacher AI App.
