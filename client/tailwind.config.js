const phaseColors = {
  sourcemap: '#00CCCC',
  window: '#FFB900',
  chunk: '#FF884D',
  metadata: '#3399FF',
  dynamic: '#FF3333',
  graphql: '#AA66FF',
  serviceworker: '#FFB900',
  phantom: '#00FF41',
  docs: '#3399FF',
  unknown: '#888888',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0D0D0D',
          card: '#1A1A1A',
          border: 'rgba(255,255,255,0.05)',
          input: '#333333',
          text: '#E0E0E0',
          muted: '#888888',
          green: '#00FF41',
          amber: '#FFB900',
          red: '#FF3333',
          blue: '#3399FF',
          purple: '#AA66FF',
          orange: '#FF884D',
          cyan: '#00CCCC',
          hover: 'rgba(0,255,65,0.05)',
          selected: 'rgba(0,255,65,0.1)',
          overlay: 'rgba(13,13,13,0.78)',
        },
        phase: phaseColors,
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Berkeley Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        terminal: '0 0 0 1px rgba(255,255,255,0.05), inset 0 0 48px rgba(0,255,65,0.035)',
        glow: '0 0 28px rgba(0,255,65,0.16)',
      },
      keyframes: {
        blink: {
          '0%, 46%': { opacity: '1' },
          '47%, 100%': { opacity: '0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        blink: 'blink 1s steps(1,end) infinite',
        scanline: 'scanline 5s linear infinite',
      },
    },
  },
  plugins: [],
};
