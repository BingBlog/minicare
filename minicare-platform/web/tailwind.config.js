/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 维护端用「中性工具色」，与家长端（minicare-web）的玫瑰粉刻意区分：
      // 本平台是桌面密集表格界面，不是移动端家庭页。详见 ui.py 顶部设计说明。
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        sidebar: 'var(--sidebar)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        text: 'var(--text)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-bg': 'var(--accent-bg)',
        'accent-line': 'var(--accent-line)',
        ok: 'var(--ok)',
        'ok-bg': 'var(--ok-bg)',
        warn: 'var(--warn)',
        'warn-bg': 'var(--warn-bg)',
        danger: 'var(--danger)',
        'danger-bg': 'var(--danger-bg)',
        'neutral-bg': 'var(--neutral-bg)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '12px',
        lg: '18px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,.06)',
        md: '0 4px 12px rgba(0,0,0,.08)',
      },
    },
  },
  plugins: [],
}
