import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * 通用弹框（用于「文档管理」里的处理详情/记录）
 *
 * 用固定定位 + 遮罩自己实现，不用原生 `<dialog>`：原生元素的 `::backdrop`、焦点陷阱、
 * 以及不同浏览器对 `showModal()` 的差异反而更难控；本平台是桌面内部工具，
 * 只需要「遮罩 + Esc 关闭 + 点击遮罩关闭」这三件事。
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width = 1100,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 打开期间锁住背景滚动，避免滚到列表却看不见弹框
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <div className="modal-title">
            <b>{title}</b>
            {subtitle ? <span className="hint">{subtitle}</span> : null}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
