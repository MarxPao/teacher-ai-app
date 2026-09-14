import os
import shutil
import zipfile
from pathlib import Path

root = Path(r"C:\Users\rafae\Documents\antigravity\blissful-noether")
dist_dir = root / "dist" / "TeacherAI_Dist"
scripts_dir = root / "scripts"
scripts_dir.mkdir(exist_ok=True)

if dist_dir.exists():
    shutil.rmtree(dist_dir)
dist_dir.mkdir(parents=True, exist_ok=True)

# 1. Copia sidecar essencial
sidecar_src = root / "sidecar"
sidecar_dst = dist_dir / "sidecar"
sidecar_dst.mkdir(exist_ok=True)

for item in sidecar_src.iterdir():
    if item.name in (".git", "__pycache__", ".pytest_cache", "tests", "screenshots", ".env"):
        continue
    if item.is_file():
        shutil.copy2(item, sidecar_dst / item.name)
    elif item.is_dir():
        shutil.copytree(item, sidecar_dst / item.name, ignore=shutil.ignore_patterns("__pycache__", "*.log"))

# 2. Copia teacher-extension
ext_src = root / "teacher-extension"
ext_dst = dist_dir / "teacher-extension"
shutil.copytree(ext_src, ext_dst, ignore=shutil.ignore_patterns(".git", "test_*"))

# 3. Cria scripts de launcher
(dist_dir / "iniciar_teacher_ai.bat").write_text(
    '@echo off\r\n'
    'start "" pythonw "%~dp0sidecar\\manual_runner.py" --tray\r\n',
    encoding="utf-8"
)

(dist_dir / "instalar_inicializacao.bat").write_text(
    '@echo off\r\n'
    'echo Registrando inicializacao automatica para o usuario atual (HKCU)...\r\n'
    'python "%~dp0sidecar\\setup_scheduled_task.py" --action install\r\n'
    'pause\r\n',
    encoding="utf-8"
)

(dist_dir / "instalar_native_host.bat").write_text(
    '@echo off\r\n'
    'echo Registrando Native Messaging Host para o Google Chrome (HKCU)...\r\n'
    'python "%~dp0sidecar\\native_host\\register_host.py" --action register\r\n'
    'pause\r\n',
    encoding="utf-8"
)

(dist_dir / "instalar_tudo_zero_admin.bat").write_text(
    '@echo off\r\n'
    'echo ====================================================\r\n'
    'echo   Instalacao do Teacher AI (Zero Privilegios Admin)\r\n'
    'echo ====================================================\r\n'
    'python "%~dp0sidecar\\native_host\\register_host.py" --action register\r\n'
    'python "%~dp0sidecar\\setup_scheduled_task.py" --action install\r\n'
    'echo.\r\n'
    'echo Iniciando o agente do Teacher AI em segundo plano...\r\n'
    'start "" pythonw "%~dp0sidecar\\manual_runner.py" --tray\r\n'
    'echo Instalacao concluida com sucesso!\r\n'
    'pause\r\n',
    encoding="utf-8"
)

(dist_dir / "LEIA-ME_INSTALACAO.txt").write_text(
    '====================================================\r\n'
    '  INSTRUCOES DE INSTALACAO DO TEACHER AI (PILOTO)\r\n'
    '====================================================\r\n\r\n'
    '1. Extraia este arquivo .ZIP em uma pasta pessoal (ex: C:\\Users\\SeuNome\\TeacherAI).\r\n'
    '2. Dê um duplo clique em "instalar_tudo_zero_admin.bat".\r\n'
    '   (Nao requer senha de Administrador da escola)\r\n'
    '3. No Google Chrome, abra chrome://extensions, ative o Modo do Desenvolvedor\r\n'
    '   e clique em "Carregar sem compactacao", selecionando a pasta "teacher-extension".\r\n'
    '4. O icone da coruja da Rafinha aparecera pronto na barra lateral do Chrome!\r\n',
    encoding="utf-8"
)

# Copia para scripts/package_distribution.py também
shutil.copy2(Path(__file__), root / "scripts" / "package_distribution.py")

# 4. Gera o arquivo ZIP
zip_path = root / "dist" / "TeacherAI_Dist.zip"
if zip_path.exists():
    zip_path.unlink()

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for file in dist_dir.rglob("*"):
        if file.is_file():
            arcname = file.relative_to(dist_dir)
            zipf.write(file, arcname)

print("Empacotamento concluido com sucesso!")
print(f"Diretório: {dist_dir}")
print(f"Arquivo ZIP: {zip_path} ({zip_path.stat().st_size} bytes)")
