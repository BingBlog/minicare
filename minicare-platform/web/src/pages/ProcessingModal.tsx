import { useApp } from '../lib/app-context'
import { Modal } from '../components/Modal'
import { DocPill, Dots } from '../components/ui'
import { DetailPage } from './Detail'

/**
 * 处理详情弹框 —— **纯查看**（2026-10-09 先拆分去历史、再按用户要求移除全部操作项）。
 *
 * 只回答"这份文档跑到哪了、有没有异常"（七步状态 + 各步产物 + 警告/错误），
 * 在文档列表里**就地查看**、不必钻进工作台；完整执行历史 → 工作台页签「处理记录」（`tab=runlog`）。
 * 操作（重跑 / 作废）已移出界面，走 CLI —— 见 `Detail.tsx` 头部注释里的命令清单。
 */
export function ProcessingModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { overview } = useApp()
  const meta = overview?.docs.find((d) => d.doc_id === docId)

  return (
    <Modal
      title={docId}
      subtitle={
        <>
          {meta ? (
            <>
              <DocPill status={meta.status} />
              <span style={{ margin: '0 6px' }}>{meta.region === 'cn' ? '国内' : '国际'}</span>
              <Dots steps={meta.steps} />
            </>
          ) : (
            '未在产物目录中扫描到'
          )}
          <span style={{ marginLeft: 8 }}>处理详情</span>
        </>
      }
      onClose={onClose}
    >
      <div className="modal-section">七步状态与产物</div>
      <DetailPage docId={docId} />
    </Modal>
  )
}
