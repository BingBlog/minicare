/**
 * 识别结果确认层（PRD-017 §5.2 / TECH-035 §4.3）
 *
 * 全屏浮层：按单据分组展示识别结果 → 用户核对（换类型 / 移除 / 单图重试）→ 确认填入或全部放弃。
 * 解析不落库：确认后仅回填表单，落库发生在「保存」动作（对齐「录入只在界面」）。
 */
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { DOC_TYPE_ORDER, DOC_TYPE_LABELS } from '@/lib/constants'
import { useNavBarPaddingTop } from '@/lib/safeArea'
import { type DocView, mergeDocViews } from './docUtils'
import DocCardView from './DocCardView'
import './documents.scss'

interface Props {
  open: boolean
  views: DocView[]
  /** 正在重试的图片（显示"重试中…"） */
  retryingFileId?: string | null
  onUpdateDocType: (fileIds: string[], docType: string) => void
  onRemove: (fileIds: string[]) => void
  onRetry: (fileId: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function DocumentParseSheet({
  open, views, retryingFileId, onUpdateDocType, onRemove, onRetry, onConfirm, onCancel,
}: Props) {
  const navPad = useNavBarPaddingTop()
  if (!open) return null

  const groups = mergeDocViews(views)
  const failed = views.filter((v) => v.status === 'failed')

  const pickType = (fileIds: string[]) => {
    Taro.showActionSheet({
      itemList: DOC_TYPE_ORDER.map((k) => DOC_TYPE_LABELS[k] ?? k),
      success: (res) => {
        const key = DOC_TYPE_ORDER[res.tapIndex]
        if (key) onUpdateDocType(fileIds, key)
      },
    })
  }

  return (
    <View className='doc-sheet'>
      <View className='doc-sheet__header' style={{ paddingTop: `calc(${navPad} + 12px)` }}>
        <Text className='doc-sheet__title'>识别结果</Text>
        <Text className='doc-sheet__close' onClick={onCancel}>×</Text>
      </View>

      <View className='doc-sheet__body'>
        <View className='doc-sheet__tip'>
          <Text>内容为 AI 识别，用药与诊断请以原始单据为准；标记「请核对」的字段建议逐项检查。</Text>
        </View>

        {groups.map((g) => (
          <DocCardView
            key={g.docType}
            group={g}
            actions={{
              onChangeType: () => pickType(g.fileIds),
              onRemove: () => onRemove(g.fileIds),
            }}
          />
        ))}

        {failed.length > 0 ? (
          <View className='doc-failed'>
            <Text className='doc-failed__title'>{failed.length} 张未识别成功</Text>
            {failed.map((v) => (
              <View className='doc-failed__item' key={v.fileId}>
                <Text className='doc-failed__msg'>{v.errorNote || '识别失败'}</Text>
                <View className='doc-failed__ops'>
                  <Text className='doc-op' onClick={() => (retryingFileId ? undefined : onRetry(v.fileId))}>
                    {retryingFileId === v.fileId ? '重试中…' : '重试'}
                  </Text>
                  <Text className='doc-op doc-op--danger' onClick={() => onRemove([v.fileId])}>移除</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {groups.length === 0 && failed.length === 0 ? (
          <View className='doc-failed'>
            <Text className='doc-failed__title'>没有可确认的识别结果</Text>
          </View>
        ) : null}
      </View>

      <View className='doc-sheet__footer'>
        <View className='doc-sheet__btn doc-sheet__btn--ghost' onClick={onCancel}>
          <Text>全部放弃</Text>
        </View>
        <View
          className={`doc-sheet__btn doc-sheet__btn--primary ${groups.length === 0 ? 'doc-sheet__btn--disabled' : ''}`}
          onClick={() => (groups.length > 0 ? onConfirm() : undefined)}
        >
          <Text>确认填入</Text>
        </View>
      </View>
    </View>
  )
}
