import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      colors: {
        sol: {
          base03: '#002b36',
          base02: '#073642',
          base01: '#586e75',
          base00: '#657b83',
          base0:  '#839496',
          base1:  '#93a1a1',
          base2:  '#eee8d5',
          base3:  '#fdf6e3',
          yellow: '#b58900',
          orange: '#cb4b16',
          red:    '#dc322f',
          cyan:   '#2aa198',
          blue:   '#268bd2',
          green:  '#859900',
          violet: '#6c71c4',
        },
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '14px',
        lg: '22px',
        xl: '30px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,43,54,0.08)',
        'card-hover': '0 8px 32px rgba(0,43,54,0.13)',
        sm: '0 1px 3px rgba(0,43,54,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.35s cubic-bezier(0.4,0,0.2,1)',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.4,0,0.2,1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
