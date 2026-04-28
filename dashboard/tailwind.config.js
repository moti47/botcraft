/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border: '#222222',
        input: '#1a1a1a',
        ring: '#8B5CF6',
        background: '#0a0a0a',
        foreground: '#fafafa',
        card: { DEFAULT: '#111111', foreground: '#fafafa' },
        popover: { DEFAULT: '#111111', foreground: '#fafafa' },
        primary: { DEFAULT: '#8B5CF6', foreground: '#ffffff' },
        secondary: { DEFAULT: '#1f1f1f', foreground: '#fafafa' },
        muted: { DEFAULT: '#1a1a1a', foreground: '#a1a1aa' },
        accent: { DEFAULT: '#1f1f1f', foreground: '#fafafa' },
        destructive: { DEFAULT: '#EF4444', foreground: '#ffffff' },
        success: { DEFAULT: '#10B981', foreground: '#ffffff' },
        warning: { DEFAULT: '#F59E0B', foreground: '#000000' },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': { from: { height: 0 }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: 0 } },
        'pulse-soft': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
