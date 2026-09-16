/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        shell: {
          bg: 'rgba(21, 16, 33, 0.86)',
          border: 'rgba(168, 85, 247, 0.16)',
          accent: '#7C3AED',
          accent2: '#A855F7',
          highlight: '#C084FC',
          text: '#F5F3FF',
          muted: '#A8A0B8',
          glow: '#7C3AED',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '60px',
      },
      animation: {
        'orb-pulse': 'orbPulse 3s ease-in-out infinite',
        'orb-rotate': 'orbRotate 8s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        orbPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.08)', opacity: '1' },
        },
        orbRotate: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-4px)' },
        }
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(124, 58, 237, 0.3)',
        'glow': '0 0 24px rgba(124, 58, 237, 0.4)',
        'glow-lg': '0 0 48px rgba(168, 85, 247, 0.45)',
        'glow-xl': '0 0 80px rgba(168, 85, 247, 0.55)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glass-lg': '0 16px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    }
  },
  plugins: []
}
