# Procedimento de Instalação e Liberação de Antivírus (Zero Privilégios de Administrador)

Este documento estabelece o protocolo de segurança, homologação contra antivírus e procedimentos de liberação para a instalação do **Teacher AI** em ambientes escolares e computadores pessoais de professores, especificamente em máquinas onde a usuária opera como **Usuário Padrão (sem privilégios administrativos / UAC)**.

---

## 1. Arquitetura da Instalação do Pacote de Distribuição (`TeacherAI_Dist.zip`)

O pacote de distribuição do Teacher AI é projetado desde a sua concepção para operar **estritamente no espaço de usuário (User Space)**:

| Componente | Local de Instalação / Execução | Privilégio Exigido | Risco de UAC / Bloqueio Admin |
|---|---|---|---|
| **Arquivos do Sidecar e Python** | `%LOCALAPPDATA%\TeacherAI` ou pasta de extração do usuário (`C:\Users\<usuario>\...`) | Usuário Padrão | **Zero** (escrita permitida no perfil do usuário) |
| **Native Messaging Host** | Chave de Registro `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.teacherai.host` | Usuário Padrão | **Zero** (`HKEY_CURRENT_USER` não exige privilégios de Administrador) |
| **Inicialização no Logon** | Chave de Registro `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TeacherAISidecar` | Usuário Padrão | **Zero** (fallback automático quando `schtasks` é bloqueado) |
| **Atalho de Contingência** | `%USERPROFILE%\Desktop\Teacher AI.lnk` | Usuário Padrão | **Zero** |
| **Extensão Chrome** | Carregamento Descompactado no perfil do Google Chrome do usuário | Usuário Padrão | **Zero** |

> [!NOTE]
> Nenhum arquivo é gravado em `C:\Program Files`, nenhum driver de kernel é instalado e nenhuma chave é gravada em `HKEY_LOCAL_MACHINE` (HKLM).

---

## 2. Diagnóstico de Antivírus e SmartScreen (Causa Raiz de Alertas)

Quando um professor baixa o arquivo compactado `TeacherAI_Dist.zip` da internet (via Google Drive, e-mail ou portal web), o sistema operacional Windows e navegadores modernos anexam automaticamente o atributo **Mark-of-the-Web (MoTW)**:
- O Windows cria um Alternate Data Stream (ADS) NTFS: `TeacherAI_Dist.zip:Zone.Identifier` contendo `ZoneId=3` (Zona da Internet).
- Se a professora extrair os arquivos sem remover essa marcação, arquivos executáveis (`.bat`, `.vbs`, scripts `.py`) herdam `ZoneId=3`.
- Ao tentar executar um `.bat` baixado da internet, o **Microsoft Defender SmartScreen** pode exibir a tela azul informativa:
  *"O Windows protegeu o seu computador — O Microsoft Defender SmartScreen impediu a inicialização de um aplicativo não reconhecido"*.

---

## 3. Procedimento de Liberação sem Administrador (Zero-Admin)

Como professoras em redes escolares não têm a senha de administrador (UAC), a liberação **não pode e não deve depender de exclusões de pasta no Windows Defender** (que exigem privilégios de Administrador). 

Existem **duas formas oficiais e seguras** de liberar a execução, ambas 100% acessíveis a um usuário padrão:

### Método A — Interface Gráfica (Mais Simples para Professoras)
1. Antes de extrair o arquivo baixado `TeacherAI_Dist.zip`:
   - Clique com o **botão direito** sobre o arquivo `TeacherAI_Dist.zip` e selecione **Propriedades**.
2. Na aba **Geral**, no canto inferior direito, localize a seção de Segurança:
   - Marque a caixa de seleção: **[X] Desbloquear** *(Unblock)*.
3. Clique em **Aplicar** e depois em **OK**.
4. Agora, extraia o arquivo normalmente (botão direito $\rightarrow$ *Extrair Tudo...*).
5. Todos os scripts já serão extraídos sem a restrição de Mark-of-the-Web.

### Método B — Comando Rápido no PowerShell do Usuário
Se a professora já extraiu a pasta e o Windows bloqueia a execução dos arquivos `.bat`:
1. Abra o **PowerShell** (basta digitar `powershell` no Menu Iniciar — **não** selecione "Executar como Administrador").
2. Execute o comando nativo que remove recursivamente o bloqueio de internet de todos os arquivos:
   ```powershell
   Unblock-File -Path "$HOME\Downloads\TeacherAI_Dist\*"
   ```
3. O comando executa instantaneamente no espaço de usuário, sem qualquer janela de UAC ou solicitação de senha.

---

## 4. Execução da Instalação do Piloto

Após desbloquear a pasta:
1. Dê um duplo clique no arquivo:
   ```text
   instalar_tudo_zero_admin.bat
   ```
2. O instalador executará:
   - Registro do Native Messaging Host no Chrome (`com.teacherai.host`).
   - Registro da chave de inicialização no logon em `HKCU Run`.
   - Inicialização imediata do processo em segundo plano com ícone na bandeja do sistema (System Tray).
3. No Google Chrome:
   - Acesse `chrome://extensions`.
   - Ative o seletor **Modo do desenvolvedor** no canto superior direito.
   - Clique em **Carregar sem compactação** e selecione a subpasta `teacher-extension`.
4. O assistente Teacher AI estará operacional e conectado.
