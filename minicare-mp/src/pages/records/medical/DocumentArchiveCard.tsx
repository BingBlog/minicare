/**
 * 单据档案卡（记录详情只读，PRD-017 §5.3 / TECH-035 §4.4）
 *
 * 编辑态表单内展示已保存的单据档案（按类型聚合卡片 + 化验指标表 + 失败图重试）。
 * 数据源：record.documents（仅 getOne 返回）。
 */
import { View, Text } from '@tarojs/components'
import type { MedicalDocumentInput } from '@/api/medical'
import { documentToView, mergeDocViews } from './docUtils'
import DocCardView from './DocCardView'
import './documents.scss'

interface Props {
  documents: MedicalDocumentInput[]
  onRetry?: (fileId: string) => void
  retryingFileId?: string | null
  /** 重新识别全部（弱化入口；覆盖档案但不动记录字段） */
  onRetryAll?: () => void
}

export default function DocumentArchiveCard({ documents, onRetry, retryingFileId, onRetryAll }: Props) {
  if (!documents || documents.length === 0) return null

  const views = documents.map(documentToView)
  const groups = mergeDocViews(views)
  const failed = views.filter((v) => v.status === 'failed')
  const dateStr = documents
    .map((d) => d.updated_at?.slice(0, 10))
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop()

  return (
    <View className='doc-archive'>
      <View className='doc-archive__caption'>
        <Text>单据档案 · 以原始单据为准{dateStr ? ` · ${dateStr}` : ''}</Text>
        {onRetryAll ? (
          <Text className='doc-archive__retry-all' onClick={onRetryAll}>重新识别</Text>
        ) : null}
      </View>

      {groups.map((g) => (
        <DocCardView key={g.docType} group={g} />
      ))}

      {failed.length > 0 ? (
        <View className='doc-failed'>
          <Text className='doc-failed__title'>{failed.length} 张未识别成功</Text>
          {failed.map((v) => (
            <View className='doc-failed__item' key={v.fileId}>
              <Text className='doc-failed__msg'>{v.errorNote || '识别失败'}</Text>
              {onRetry ? (
                <View className='doc-failed__ops'>
                  <Text className='doc-op' onClick={() => (retryingFileId ? undefined : onRetry(v.fileId))}>
                    {retryingFileId === v.fileId ? '重试中…' : '重试'}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
