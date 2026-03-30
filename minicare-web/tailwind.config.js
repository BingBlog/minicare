/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F87098',
          dark: '#E85580',
          light: '#FFF0F4',
          mid: '#F8B8CC',
        },
        yellow: {
          DEFAULT: '#F8C870',
          dark: '#C0922A',
          light: '#FFF8E6',
        },
        teal: {
          DEFAULT: '#68D0B8',
          dark: '#3CABA8',
          light: '#EDFAF8',
        },
        bg: '#FDF7F5',
        card: '#FFFFFF',
        border: '#EDE5E3',
        text: '#3D2B2E',
        subtext: '#9A7E82',
      },
      fontFamily: {
        sans: ['-apple-system', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        'xl': '24px',
        'lg': '18px',
        'md': '12px',
        'sm': '8px',
      },
      boxShadow: {
        'sm': '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
        'md': '0 4px 12px rgba(0,0,0,.08)',
        'lg': '0 8px 24px rgba(0,0,0,.10)',
      },
    },
  },
  plugins: [],
}
