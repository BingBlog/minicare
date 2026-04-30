import { View, Text } from '@tarojs/components'
import type { HomeRecord } from './types'

interface RecordActionSheetProps {
  open: boolean
  record: HomeRecord | null
  deleting: boolean
  onClose: () => void
  onEdit: (record: HomeRecord) => void
  onDelete: (recordId: string) => void
}

export default function RecordActionSheet({ open, record, deleting, onClose, onEdit, onDelete }: RecordActionSheetProps) {
  if (!open || !record) return null

  return (
    <View className='fab-mask' onClick={onClose}>
      <View className='action-sheet' onClick={(e) => e.stopPropagation()}>
        <Text className='action-sheet__title'>{record.title}</Text>
        <View className='action-sheet__item' onClick={() => onEdit(record)}>
          <Text className='action-sheet__item-text'>编辑记录</Text>
        </View>
        <View
          className='action-sheet__item'
          onClick={() => {
            if (deleting) return
            onDelete(record.id)
            onClose()
          }}
        >
          <Text
            className='action-sheet__item-text action-sheet__item-text--danger'
            style={{ opacity: deleting ? 0.5 : 1 }}
          >
            {deleting ? '删除中...' : '删除记录'}
          </Text>
        </View>
        <View className='action-sheet__cancel' onClick={onClose}>
          <Text className='action-sheet__cancel-text'>取消</Text>
        </View>
      </View>
    </View>
  )
}
