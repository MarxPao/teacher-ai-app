import os, re

base = r'c:\Users\rafae\Documents\antigravity\blissful-noether\components'

audit = {
    'outline_none': [],
    'clickable_divs': [],
    'icon_buttons_no_aria': [],
    'modals_no_esc': [],
    'inputs_no_label': []
}

for root, dirs, files in os.walk(base):
    for f in files:
        if not f.endswith(('.tsx', '.jsx')): continue
        path = os.path.join(root, f)
        rel = os.path.relpath(path, base)
        content = open(path, encoding='utf-8').read()
        lines = content.splitlines()

        # 1. outline: 'none' or outline: none without focus-visible
        for i, line in enumerate(lines):
            if "outline: 'none'" in line or 'outline: none' in line or 'outline:none' in line:
                audit['outline_none'].append((rel, i+1, line.strip()[:100]))

        # 2. Clickable div/span (onClick on div/span without role or tabIndex)
        for i, line in enumerate(lines):
            if ('<div ' in line or '<span ' in line) and 'onClick=' in line:
                if 'role=' not in line and 'tabIndex=' not in line:
                    audit['clickable_divs'].append((rel, i+1, line.strip()[:100]))

        # 3. Icon-only buttons without aria-label
        # (check pattern <button ...> <i className="ti ..."/> </button>)
        for i, line in enumerate(lines):
            if '<button' in line and 'aria-label' not in line:
                ctx = '\n'.join(lines[i:min(i+4, len(lines))])
                if re.search(r'<i\s+className=[\"\']ti\s+ti-[^\"\']+[\"\']\s*/>\s*</button>', ctx):
                    audit['icon_buttons_no_aria'].append((rel, i+1, line.strip()[:100]))

print(f"=== AUDITORIA ESTATÍSTICA WCAG 2.1 AA ===")
print(f"1. Elementos com outline: 'none' removendo anel de foco nativo: {len(audit['outline_none'])} ocorrências")
for rel, l, s in audit['outline_none'][:5]:
    print(f"   - {rel}:{l} -> {s}")

print(f"\n2. <div> ou <span> clicáveis sem role='button', tabIndex ou onKeyDown: {len(audit['clickable_divs'])} ocorrências")
for rel, l, s in audit['clickable_divs'][:5]:
    print(f"   - {rel}:{l} -> {s}")

print(f"\n3. Botões puramente de ícone sem aria-label: {len(audit['icon_buttons_no_aria'])} ocorrências")
for rel, l, s in audit['icon_buttons_no_aria'][:5]:
    print(f"   - {rel}:{l} -> {s}")
