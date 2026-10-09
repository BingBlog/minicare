import type { AllergyType, AllergyLevel } from '@/api'

export type SettingsRowIcon =
  | 'font'
  | 'users'
  | 'phone'
  | 'heart'
  | 'fileText'
  | 'mail'
  | 'monitor'
  | 'speaker'
  | 'lock'

export interface SettingsRowBase {
  id: string
  icon: SettingsRowIcon
  iconBg: string
  label: string
}

export interface ToggleRow extends SettingsRowBase {
  type: 'toggle'
  checked: boolean
  onToggle: () => void
}

export interface ArrowRow extends SettingsRowBase {
  type: 'arrow'
  subText?: string
  onClick: () => void
}

export interface InfoRow extends SettingsRowBase {
  type: 'info'
  value: string
}

export type SettingsRow = ToggleRow | ArrowRow | InfoRow

export interface EditBabyFormData {
  name: string
  birthDate: string
  gender: 'male' | 'female' | 'unknown'
  allergyTypes: AllergyType[]
  allergyLevel: AllergyLevel
}
