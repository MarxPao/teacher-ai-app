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

colors = {
    'paperDeep':   '#1c110a',
    'paperInk':    '#2c1a0e',
    'paperSepia':  '#5c3d20',
    'paperWarm':   '#7a5c42',
    'paperMid':    '#a08060',
    'paperLight':  '#c4a882',
    'accent':      '#8b5e3c',
    'accentLight': '#b5805a',
    'accentGold':  '#c4834a',
    'success':     '#3d7a4e',
    'warning':     '#c87a1e',
    'danger':      '#a83232',
    'info':        '#2a6080',
}

backgrounds = {
    'paperPage (fundo geral)': '#fdf8f2',
    'surface1 (#fffcf8)': '#fffcf8',
    'paperCream (#f5efe6)': '#f5efe6',
    'paperAlt (#f0e8d8)': '#f0e8d8',
    'surface2 (#f7f0e8)': '#f7f0e8',
    'surface3 (#ede4d6)': '#ede4d6',
}

print('=== WCAG 2.1 CONTRAST RATIO AUDIT (Target: >= 4.5:1 for normal text, >= 3.0:1 for large) ===\n')

for bg_name, bg_hex in backgrounds.items():
    print(f'--- Background: {bg_name} ({bg_hex}) ---')
    for fg_name, fg_hex in colors.items():
        cr = contrast_ratio(fg_hex, bg_hex)
        pass_aa = '[PASS AA Normal & Large]' if cr >= 4.5 else ('[PASS Large Only >=3.0]' if cr >= 3.0 else '[FAIL <3.0:1]')
        print(f'  {fg_name:12} ({fg_hex}) -> {cr:.2f}:1 | {pass_aa}')
    print()
