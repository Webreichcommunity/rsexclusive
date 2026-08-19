/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#ffffff',
        bone: '#f7f7f7',
        steel: '#f7f7f7',
        inkline: '#222222',
        charcoal: '#222222',
        graphite: '#484848',
        amberline: '#7f1d1d',
        claret: '#651b24',
        wine: '#4a111a',
        espresso: '#222222',
        mist: '#dddddd',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 28px rgba(0, 0, 0, 0.08)',
        panel: '0 18px 48px rgba(0, 0, 0, 0.12)',
        glass: '0 18px 48px rgba(0, 0, 0, 0.16)',
        card: '0 12px 32px rgba(0, 0, 0, 0.14)',
      },
    },
  },
  plugins: [],
}
