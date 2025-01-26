/**
 * Material Design 3 token layer (PRD §2).
 *
 * ── PROVISIONAL VALUES ──────────────────────────────────────────────────────
 * The colour values live as CSS custom properties in src/styles.scss, NOT here.
 * They are placeholders chosen only to satisfy WCAG 2.1 AA contrast (PRD §10.3)
 * while the Figma file is unreadable — they are NOT the NowNowHR brand palette.
 *
 * When the Figma MCP connection works, pull the file's variables and replace the
 * values in styles.scss. Because everything here maps to a custom property, that
 * is a one-file change and no component markup moves.
 *
 * Rule for anyone adding markup: use the semantic names (bg-surface,
 * text-on-surface-variant, border-outline). Never a raw hex, and never a stock
 * Tailwind colour like bg-blue-500 — neither can be re-themed.
 */

/** Wrap a custom property so Tailwind's opacity modifiers (bg-primary/90) work. */
const token = name => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // MD3 colour roles
        primary: token('--md-primary'),
        'on-primary': token('--md-on-primary'),
        'primary-container': token('--md-primary-container'),
        'on-primary-container': token('--md-on-primary-container'),

        secondary: token('--md-secondary'),
        'on-secondary': token('--md-on-secondary'),

        surface: token('--md-surface'),
        'on-surface': token('--md-on-surface'),
        'surface-variant': token('--md-surface-variant'),
        'on-surface-variant': token('--md-on-surface-variant'),
        'surface-container': token('--md-surface-container'),

        outline: token('--md-outline'),
        'outline-variant': token('--md-outline-variant'),
        scrim: token('--md-scrim'),

        error: token('--md-error'),
        'on-error': token('--md-on-error'),
        'error-container': token('--md-error-container'),
        'on-error-container': token('--md-on-error-container'),

        // Extensions to MD3: it ships no success or warning role, but an HR tool
        // needs both (approved / pending, present / late).
        success: token('--md-success'),
        'on-success': token('--md-on-success'),
        'success-container': token('--md-success-container'),
        'on-success-container': token('--md-on-success-container'),

        warning: token('--md-warning'),
        'on-warning': token('--md-on-warning'),
        'warning-container': token('--md-warning-container'),
        'on-warning-container': token('--md-on-warning-container'),
      },

      // MD3 type scale. [size, { lineHeight, letterSpacing, fontWeight }]
      fontSize: {
        'display-lg': ['3.5rem', { lineHeight: '4rem', letterSpacing: '-0.015em' }],
        'display-md': ['2.8125rem', { lineHeight: '3.25rem' }],
        'display-sm': ['2.25rem', { lineHeight: '2.75rem' }],

        'headline-lg': ['2rem', { lineHeight: '2.5rem' }],
        'headline-md': ['1.75rem', { lineHeight: '2.25rem' }],
        'headline-sm': ['1.5rem', { lineHeight: '2rem' }],

        'title-lg': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '500' }],
        'title-md': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0.009em', fontWeight: '600' }],
        'title-sm': [
          '0.875rem',
          { lineHeight: '1.25rem', letterSpacing: '0.007em', fontWeight: '600' },
        ],

        'body-lg': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0.031em' }],
        'body-md': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.016em' }],
        'body-sm': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.025em' }],

        'label-lg': [
          '0.875rem',
          { lineHeight: '1.25rem', letterSpacing: '0.006em', fontWeight: '500' },
        ],
        'label-md': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.031em', fontWeight: '500' }],
        'label-sm': [
          '0.6875rem',
          { lineHeight: '1rem', letterSpacing: '0.031em', fontWeight: '500' },
        ],
      },

      borderRadius: {
        // MD3 shape scale
        xs: '0.25rem',
        sm: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.75rem',
      },

      boxShadow: {
        // MD3 elevation levels 1-3, plus two purpose-built shadows.
        'level-1': '0 1px 2px 0 rgb(0 0 0 / 0.30), 0 1px 3px 1px rgb(0 0 0 / 0.15)',
        'level-2': '0 1px 2px 0 rgb(0 0 0 / 0.30), 0 2px 6px 2px rgb(0 0 0 / 0.15)',
        'level-3': '0 4px 8px 3px rgb(0 0 0 / 0.15), 0 1px 3px 0 rgb(0 0 0 / 0.30)',
        dialog: '0 8px 24px -4px rgb(0 0 0 / 0.20), 0 4px 8px -4px rgb(0 0 0 / 0.12)',
        toast: '0 4px 12px -2px rgb(0 0 0 / 0.18)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'dialog-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
      },

      animation: {
        // Always used behind motion-safe:, so prefers-reduced-motion wins (PRD §10.3).
        'fade-in': 'fade-in 150ms ease-out',
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        'toast-in': 'toast-in 180ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },

      screens: {
        // Desktop-first (PRD §2.1): design at 1440px, must not break at 1280px.
        // There are deliberately no mobile breakpoints.
        desktop: '1280px',
        wide: '1440px',
      },
    },
  },
  plugins: [],
};
