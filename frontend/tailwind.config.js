export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'sans-serif'],
        sans:    ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        bg:       'rgb(var(--c-bg)       / <alpha-value>)',
        surface:  'rgb(var(--c-surface)  / <alpha-value>)',
        elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
        border:   'rgb(var(--c-border)   / <alpha-value>)',
        accent:   'rgb(var(--c-accent)   / <alpha-value>)',
        t1:       'rgb(var(--c-t1)       / <alpha-value>)',
        t2:       'rgb(var(--c-t2)       / <alpha-value>)',
        t3:       'rgb(var(--c-t3)       / <alpha-value>)',
        ok:       'rgb(var(--c-ok)       / <alpha-value>)',
        err:      'rgb(var(--c-err)      / <alpha-value>)',
      },
      boxShadow: {
        card:      '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-md': '0 4px 16px rgb(0 0 0 / 0.10), 0 2px 6px -1px rgb(0 0 0 / 0.06)',
        glow:      '0 0 0 2px rgb(var(--c-accent) / 0.35), 0 0 24px rgb(var(--c-accent) / 0.15)',
      },
    },
  },
  plugins: [],
}
