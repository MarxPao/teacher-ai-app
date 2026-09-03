def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))

def rel_luminance(rgb):
    def channel_lum(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = [channel_lum(c) for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast_ratio(hex1, hex2):
    l1 = rel_luminance(hex_to_rgb(hex1))
    l2 = rel_luminance(hex_to_rgb(hex2))
    lum_top = max(l1, l2)
    lum_bot = min(l1, l2)
    return (lum_top + 0.05) / (lum_bot + 0.05)

# Candidate updated palette:
new_colors = {
    'paperDeep':   '#1c110a',
    'paperInk':    '#2c1a0e',
    'paperSepia':  '#5c3d20',
    'paperWarm':   '#7a5c42',
    'paperMid':    '#71553d', # updated from #a08060
    'paperLight':  '#6f533a', # updated from #c4a882
    'accent':      '#8b5e3c',
    'accentLight': '#875532', # updated from #b5805a
    'accentGold':  '#945722', # updated from #c4834a
    'success':     '#3d7a4e', # updated check
    'warning':     '#945710', # updated from #c87a1e
    'danger':      '#a83232',
    'info':        '#2a6080',
}

backgrounds = {
    'paperPage (#fdf8f2)': '#fdf8f2',
    'surface1 (#fffcf8)': '#fffcf8',
    'paperCream (#f5efe6)': '#f5efe6',
    'paperAlt (#f0e8d8)': '#f0e8d8',
}

print('=== VERIFICAÇÃO EXATA DOS RATIOS RECALCULADOS ===\n')

all_pass = True
for bg_name, bg_hex in backgrounds.items():
    print(f'--- Background: {bg_name} ---')
    for fg_name, fg_hex in new_colors.items():
        cr = contrast_ratio(fg_hex, bg_hex)
        pass_aa = '[PASS AA]' if cr >= 4.5 else '[FAIL <4.5]'
        if cr < 4.5: all_pass = False
        print(f'  {fg_name:12} ({fg_hex}) -> {cr:.2f}:1 | {pass_aa}')
    print()

print(f'All tokens pass WCAG 2.1 AA (>= 4.5:1): {all_pass}')
