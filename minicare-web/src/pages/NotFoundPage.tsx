import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl mb-4">🌸</div>
      <h1 className="text-xl font-bold text-text mb-2">页面不见了</h1>
      <p className="text-sm text-subtext mb-6">你访问的页面好像跑去玩了</p>
      <Link
        to="/"
        className="px-6 py-3 bg-primary text-white rounded-xl font-semibold shadow-md shadow-primary/30"
      >
        回到首页
      </Link>
    </div>
  )
}
