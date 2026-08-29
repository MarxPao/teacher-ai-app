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
          base02: '#2c1a0e',
          base01: '#7a5c42',
          base00: '#657b83',
          base0:  '#839496',
          base1:  '#a08060',
          base2:  '#f0e8d8',
          base3:  '#fdf8f2',
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
        card: '0 4px 20px rgba(44,26,14,0.08)',
        'card-hover': '0 8px 32px rgba(44,26,14,0.13)',
        sm: '0 1px 3px rgba(44,26,14,0.06)',
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
