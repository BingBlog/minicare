/**
 * 医疗记录 - OCR 上传区域（拍照或上传病历/报告进行自动识别）
 * 与 Web pages/records/medical/OCRSection.tsx 语义对齐
 *
 * 差异化说明：
 * - Web 使用 <input type="file">，MP 使用 Taro.chooseImage
 * - OCR 识别逻辑使用相同的 mock 流程（后续对接真实 OCR 服务时两端同步）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

const ICON_CAMERA = `data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 24 24" fill="none" stroke="#F87098" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>')}`

/** OCR 模拟结果（与 Web mockOcrResult 一致） */
const mockOcrResult = [
  { label: '检查项目', value: '儿保 4 月龄' },
  { label: '身高', value: '68.0 cm' },
  { label: '体重', value: '7.5 kg' },
  { label: '结论', value: '发育正常' },
]

interface Props {
  showToast: (msg: string) => void
}

export default function OCRSection({ showToast }: Props) {
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState(false)

  const handleOCR = () => {
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: () => {
        setOcrLoading(true)
        showToast('正在识别中…')
        setTimeout(() => {
          setOcrLoading(false)
          setOcrResult(true)
        }, 1200)
      },
    })
  }

  const confirmOCR = () => {
    setOcrResult(false)
    showToast('识别内容已填入')
  }

  if (!ocrResult) {
    return (
      <View
        className={`medical-ocr__upload ${ocrLoading ? 'medical-ocr__upload--loading' : ''}`}
        onClick={ocrLoading ? undefined : handleOCR}
      >
        <Image className='medical-ocr__camera' src={ICON_CAMERA} />
        <Text className='medical-ocr__title'>拍照或上传病历/报告</Text>
        <Text className='medical-ocr__desc'>
          支持 OCR 自动提取结构化结果{'\n'}原图同时留档保存
        </Text>
        <View className='medical-ocr__btn'>
          <Text className='medical-ocr__btn-text'>
            {ocrLoading ? '识别中…' : '选择图片'}
          </Text>
        </View>
      </View>
    )
  }

  // OCR 识别结果
  return (
    <View className='medical-ocr__result'>
      <Text className='medical-ocr__result-title'>OCR 识别结果，请确认：</Text>
      {mockOcrResult.map(({ label, value }) => (
        <View key={label} className='medical-ocr__result-row'>
          <Text className='medical-ocr__result-label'>{label}</Text>
          <View className='medical-ocr__result-value-wrap'>
            <Text className='medical-ocr__result-value'>{value}</Text>
            <Text className='medical-ocr__result-edit'>修改</Text>
          </View>
        </View>
      ))}
      <View className='medical-ocr__result-actions'>
        <View className='medical-ocr__result-btn medical-ocr__result-btn--secondary' onClick={() => setOcrResult(false)}>
          <Text>重新上传</Text>
        </View>
        <View className='medical-ocr__result-btn medical-ocr__result-btn--primary' onClick={confirmOCR}>
          <Text>确认信息</Text>
        </View>
      </View>
    </View>
  )
}
