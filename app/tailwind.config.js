/** @type {import('tailwindcss').Config} */
const colorVar = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        page: colorVar('--color-page'),
        surface: colorVar('--color-surface'),
        error: colorVar('--color-error'),
        brand: {
          50: colorVar('--color-brand-50'),
          100: colorVar('--color-brand-100'),
          200: colorVar('--color-brand-200'),
          300: colorVar('--color-brand-300'),
          400: colorVar('--color-brand-400'),
          500: colorVar('--color-brand-500'),
          600: colorVar('--color-brand-600'),
          700: colorVar('--color-brand-700'),
        },
        ink: {
          600: colorVar('--color-ink-600'),
          700: colorVar('--color-ink-700'),
          800: colorVar('--color-ink-800'),
        },
        success: colorVar('--color-success'),
        warning: colorVar('--color-warning'),
        slate: {
          50: colorVar('--color-slate-50'),
          100: colorVar('--color-slate-100'),
          200: colorVar('--color-slate-200'),
          300: colorVar('--color-slate-300'),
          400: colorVar('--color-slate-400'),
          500: colorVar('--color-slate-500'),
          600: colorVar('--color-slate-600'),
          700: colorVar('--color-slate-700'),
          800: colorVar('--color-slate-800'),
          900: colorVar('--color-slate-900'),
        },
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
      },
    },
  },
  plugins: [],
}
