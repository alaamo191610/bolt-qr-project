// tailwind.config.js (or tailwind.config.ts)
import plugin from 'tailwindcss/plugin'
import aspectRatio from '@tailwindcss/aspect-ratio'
import forms from '@tailwindcss/forms'

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

      borderRadius: {
        '2xl': '1rem',
        '4xl': '2rem',
      },

      boxShadow: {
        soft: '0 12px 30px -12px rgba(0,0,0,.18)',
        card: '0 8px 24px -12px rgba(0,0,0,.18)',
      },

      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
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
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%': { transform: 'translateY(12px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        pageIn: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0%)' } },
        panelIn: { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0%)' } },
        sheetIn: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0%)' } },
        bump: { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
        totalPop: { '0%': { transform: 'scale(.98)', opacity: .9 }, '100%': { transform: 'scale(1)', opacity: 1 } },
      },

      animation: {
        'fade-in': 'fadeIn .25s ease-out',
        'slide-up': 'slideUp .28s ease-out',
        'scale-in': 'scaleIn .18s ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'page-in': 'pageIn .32s cubic-bezier(.22,1,.36,1)',
        'panel-in': 'panelIn .30s cubic-bezier(.22,1,.36,1)',
        'sheet-in': 'sheetIn .28s cubic-bezier(.22,1,.36,1)',
        bump: 'bump .22s cubic-bezier(.34,1.56,.64,1)',
        'total-pop': 'totalPop .28s cubic-bezier(.22,1,.36,1)',
      },
    },
  },

  plugins: [
    require('@tailwindcss/aspect-ratio'),
    require('@tailwindcss/forms')({ strategy: 'class' }),
  
    // THEME-AWARE BUTTON SYSTEM
    plugin(({ addComponents }) => {
      addComponents({
        /* Base button */
        '.btn': {
          '@apply inline-flex items-center justify-center font-medium rounded-lg transition focus:outline-none ring-2 ring-offset-2 ring-[color:var(--color-primary)]':
            {},
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',  // text-sm
          lineHeight: '1.25rem',
          gap: '0.5rem',
        },
  
        /* Sizes */
        '.btn-sm': { padding: '0.375rem 0.75rem', fontSize: '0.8125rem', lineHeight: '1.15rem' },
        '.btn-lg': { padding: '0.75rem 1.25rem', fontSize: '1rem', lineHeight: '1.5rem' },
        '.btn-icon': { padding: '0.5rem', width: '2.5rem', height: '2.5rem' },
  
        /* Variants */
        '.btn-primary': {
          background: 'var(--color-primary)',
          '@apply text-white shadow hover:opacity-90': {},
        },
        '.btn-secondary': {
          background: 'var(--color-secondary)',
          '@apply text-white shadow hover:opacity-90': {},
        },
        '.btn-accent': {
          background: 'var(--color-accent)',
          '@apply text-white shadow hover:opacity-90': {},
        },
        '.btn-outline': {
          '@apply border border-slate-300 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800':
            {},
          background: 'transparent',
        },
        '.btn-ghost': {
          '@apply text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/60': {},
          background: 'transparent',
        },
  
        /* State */
        '.btn:disabled, .btn[aria-disabled="true"]': {
          '@apply opacity-60 cursor-not-allowed shadow-none': {},
        },
      })
    }),
  ],  
}