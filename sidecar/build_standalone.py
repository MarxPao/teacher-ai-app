"""
build_standalone.py — Script de Empacotamento Standalone com PyInstaller
Gera o executável desktop do Sidecar para distribuição aos professores sem necessidade de Python instalado.
"""

import os
import subprocess
import sys

def build():
    print("=" * 60)
    print(" 🛠️  Empacotando Teacher AI Sidecar Desktop...")
    print("=" * 60)

    try:
        import PyInstaller
    except ImportError:
        print("Instalando PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name=TeacherAI-Sidecar",
        "--onefile",
        "--noconsole",
        "--add-data=requirements.txt;.",
        "--hidden-import=playwright",
        "--hidden-import=keyring",
        "--hidden-import=cryptography",
        "--hidden-import=pystray",
        "--hidden-import=PIL",
        "main.py"
    ]

    print(f"Executando comando: {' '.join(cmd)}")
    subprocess.check_call(cmd)

    print("\n✅ Executável gerado com sucesso no diretório 'dist/TeacherAI-Sidecar'!")

if __name__ == "__main__":
    build()
