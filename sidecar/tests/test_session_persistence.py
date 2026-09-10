"""
test_session_persistence.py — Teste de Persistência de Sessão (Etapa 1)

Valida o critério de pronto da Etapa 1:
  "Sessao sobrevive a 3 ciclos de fechar/abrir sem re-autenticação."

Uso:
    python test_session_persistence.py

O teste NÃO requer que a professora esteja logada em nenhum portal.
Ele verifica os ARTEFATOS DE SESSÃO em disco (cookies, Login Data)
sobrevivem a 3 ciclos de kill + relaunch do Chrome dedicado.

Critérios de cada ciclo:
  1. Chrome abre com o perfil dedicado.
  2. CDP responde na porta 9222.
  3. O arquivo de cookies (.../Default/Network/Cookies) existe E não encolheu.
  4. O Chrome é encerrado via kill_dedicated_chrome().
  5. Na próxima abertura, os arquivos de sessão ainda estão intactos em disco.

Ao final exibe: PASSOU (3/3 ciclos) ou FALHOU (N/3 ciclos), com detalhe
de qual verificação falhou e em qual ciclo.
"""

import sys
import time
import os

# Adiciona o diretório sidecar/ ao path (pai de tests/)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from chrome_launcher import (
    launch_dedicated_chrome,
    kill_dedicated_chrome,
    check_cdp_health,
    check_session_files,
    get_open_tabs,
    full_diagnostic,
    PROFILE_DIR,
)

CYCLES = 3
SETTLE_SECONDS = 4  # tempo para o Chrome gravar sessão em disco após abrir


def _header(text: str):
    print(f"\n{'='*55}")
    print(f"  {text}")
    print(f"{'='*55}")


def _check(label: str, condition: bool, detail: str = "") -> bool:
    mark = "OK" if condition else "FALHA"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
    return condition


def run_persistence_test() -> bool:
    _header("Teste de Persistência de Sessão — Etapa 1")
    print(f"  Perfil: {PROFILE_DIR}")
    print(f"  Ciclos: {CYCLES}")

    results = []
    cookie_size_before = None

    for cycle in range(1, CYCLES + 1):
        _header(f"Ciclo {cycle}/{CYCLES}")
        cycle_passed = True

        # ── 1. Abrir o Chrome dedicado ──────────────────────────────────────
        print(f"\n[{cycle}] Abrindo Chrome dedicado...")
        ok, msg = launch_dedicated_chrome()
        print(f"       {msg}")
        cycle_passed &= _check("Chrome iniciou e CDP responde", ok)

        if not ok:
            results.append(False)
            print(f"  >> Ciclo {cycle} FALHOU na abertura. Pulando para o próximo.")
            continue

        # ── 2. Aguarda o Chrome gravar cookies em disco ──────────────────────
        print(f"\n[{cycle}] Aguardando {SETTLE_SECONDS}s para o Chrome gravar sessão...")
        time.sleep(SETTLE_SECONDS)

        # ── 3. Verificar arquivos de sessão ──────────────────────────────────
        sess = check_session_files()
        cycle_passed &= _check(
            "Pasta do perfil Default existe",
            sess["profile_dir_exists"]
        )
        cycle_passed &= _check(
            "Network/Cookies existe em disco",
            sess["cookies_file_exists"],
            f"{sess['cookies_size_bytes']} bytes"
        )
        cycle_passed &= _check(
            "Login Data existe em disco",
            sess["login_data_exists"],
            f"{sess['login_data_size_bytes']} bytes"
        )

        current_cookie_size = sess.get("cookies_size_bytes", 0)
        if cookie_size_before is not None:
            # Os cookies NÃO devem ter encolhido entre ciclos
            not_shrunk = current_cookie_size >= cookie_size_before
            cycle_passed &= _check(
                "Cookies nao encolheram entre ciclos",
                not_shrunk,
                f"antes={cookie_size_before}b agora={current_cookie_size}b"
            )
        cookie_size_before = current_cookie_size

        # ── 4. Lista abas abertas via CDP ────────────────────────────────────
        tabs = get_open_tabs()
        print(f"\n[{cycle}] Abas abertas: {len(tabs)}")
        for t in tabs[:3]:
            print(f"       - {t['title'] or t['url']}")

        # ── 5. Fechar o Chrome dedicado ──────────────────────────────────────
        print(f"\n[{cycle}] Encerrando Chrome dedicado...")
        kill_ok, kill_msg = kill_dedicated_chrome()
        print(f"       {kill_msg}")
        cycle_passed &= _check("Chrome encerrou corretamente", kill_ok)

        # Aguarda o processo sair de fato
        time.sleep(1.5)

        # ── 6. Verificar que os arquivos AINDA ESTÃO em disco após fechar ────
        sess_after = check_session_files()
        cycle_passed &= _check(
            "Cookies permanecem em disco após fechar Chrome",
            sess_after["cookies_file_exists"],
            f"{sess_after['cookies_size_bytes']} bytes"
        )
        cycle_passed &= _check(
            "Login Data permanece em disco após fechar Chrome",
            sess_after["login_data_exists"],
        )

        results.append(cycle_passed)
        status = "PASSOU" if cycle_passed else "FALHOU"
        print(f"\n  >> Ciclo {cycle}: {status}")

    # ── Resultado Final ──────────────────────────────────────────────────────
    _header("Resultado Final")
    passed = sum(results)
    total  = len(results)
    all_ok = passed == total

    for i, r in enumerate(results, 1):
        print(f"  Ciclo {i}: {'PASSOU' if r else 'FALHOU'}")

    print()
    if all_ok:
        print(f"  CRITERIO DE PRONTO ATINGIDO: {passed}/{total} ciclos passaram.")
        print("  A sessão sobrevive ao ciclo fechar/abrir sem re-autenticação em disco.")
        print()
        print("  IMPORTANTE: Para validar que a sessão WEB sobrevive (login de portal")
        print("  escolar ainda ativo), faça manualmente:")
        print("    1. Abra: python chrome_launcher.py")
        print("    2. Faça login no portal da escola na janela que abriu.")
        print("    3. Execute: python chrome_launcher.py --kill")
        print("    4. Execute: python chrome_launcher.py")
        print("    5. Verifique que o portal da escola ainda está logado (sem pedir senha).")
    else:
        failed = [i+1 for i, r in enumerate(results) if not r]
        print(f"  CRITERIO DE PRONTO NAO ATINGIDO: {passed}/{total} ciclos passaram.")
        print(f"  Ciclos com falha: {failed}")
        print("  Verifique os detalhes acima para identificar a causa.")

    print()
    return all_ok


if __name__ == "__main__":
    ok = run_persistence_test()
    sys.exit(0 if ok else 1)
