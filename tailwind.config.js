/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './public/index.html'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'bg-elev-1': 'var(--bg-elev-1)',
        'bg-elev-2': 'var(--bg-elev-2)',
        'bg-input': 'var(--bg-input)',
        'bg-hover': 'var(--bg-hover)',
        'ink-1': 'var(--ink-1)',
        'ink-2': 'var(--ink-2)',
        'ink-muted': 'var(--ink-muted)',
        'line-soft': 'var(--line-soft)',
        'line-strong': 'var(--line-strong)',
        'accent-electric': 'var(--accent-electric)',
        'accent-electric-strong': 'var(--accent-electric-strong)',
        'accent-lime': 'var(--accent-lime)',
        'accent-warn': 'var(--accent-warn)',
        'accent-danger': 'var(--accent-danger)',
        'accent-soft': 'var(--accent-soft)',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '20px',
        xl: '26px',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        medium: 'var(--shadow-medium)',
        strong: 'var(--shadow-strong)',
      },
    },
  },
  plugins: [],
};
