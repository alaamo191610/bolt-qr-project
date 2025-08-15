/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      container: { center: true, padding: { DEFAULT: '1rem', sm: '1rem' } },

      fontFamily: {
        'playpen-arabic': ['var(--font-playpen-arabic)'],
        arabic: ['var(--font-playpen-arabic)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '2xl': '1rem' },
      boxShadow: { 'soft': '0 8px 30px rgba(0,0,0,0.06)' },   
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
      },

      borderRadius: {
        '4xl': '2rem',
      },

      boxShadow: {
        soft: '0 12px 30px -12px rgba(0,0,0,.18)',
        card: '0 8px 24px -12px rgba(0,0,0,.18)',
      },

      backdropBlur: { xs: '2px' },

      screens: { xs: '475px' },

      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },

      /* ---------- Animations used across cards/drawers ---------- */
      keyframes: {
        // existing
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },

        // new (card/page)
        pageIn: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0%)' },
        },
        panelIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0%)' },
        },
        sheetIn: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0%)' },
        },
        bump: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        totalPop: {
          '0%': { transform: 'scale(.98)', opacity: .9 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
      },

      animation: {
        // existing
        'fade-in': 'fadeIn .25s ease-out',
        'slide-up': 'slideUp .28s ease-out',
        'scale-in': 'scaleIn .18s ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',

        // new
        'page-in': 'pageIn .32s cubic-bezier(.22,1,.36,1)',
        'panel-in': 'panelIn .30s cubic-bezier(.22,1,.36,1)',
        'sheet-in': 'sheetIn .28s cubic-bezier(.22,1,.36,1)',
        bump: 'bump .22s cubic-bezier(.34,1.56,.64,1)',
        'total-pop': 'totalPop .28s cubic-bezier(.22,1,.36,1)',
      },
    },
  },

  plugins: [
    require('@tailwindcss/line-clamp'),
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/forms')({ strategy: 'class' }),
    // Optional RTL utilities:
    // require('tailwindcss-rtl')
  ],
};