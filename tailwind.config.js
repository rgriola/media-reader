/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          white: '#F5F5F5',
          black: '#111111'
        },
        surface: {
          DEFAULT: '#1A1A1A',
          raised: '#252525',
          border: '#333333'
        },
        muted: '#888888',
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB'
        },
        success: '#22C55E',
        warning: '#EAB308',
        danger: '#EF4444',
        'mxf-orange': '#F97316'
      },
      fontSize: {
        header: ['24px', { lineHeight: '32px', fontWeight: '700' }],
        subheader: ['18px', { lineHeight: '26px', fontWeight: '700' }],
        body: ['14px', { lineHeight: '22px' }],
        data: ['13px', { lineHeight: '20px' }],
        special: ['12px', { lineHeight: '18px' }]
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      }
    }
  },
  plugins: []
}
