/**
 * 全局 SVG 图标库
 *
 * 设计规范：
 * - 所有图标均基于 Lucide 图标集（https://lucide.dev），stroke 风格
 * - 默认尺寸 20×20，可通过 size / style props 覆盖
 * - 颜色默认继承 currentColor，需要固定颜色时通过 color prop 传入
 * - strokeWidth 默认 1.5（列表场景）或 2（表单/标题场景）
 *
 * 命名规约：Icon + 语义名称（大驼峰），避免使用形状描述（如 IconCircle）
 */

import type { CSSProperties } from 'react'

/** 所有图标共享的 props 接口 */
export interface IconProps {
  /** 图标尺寸（正方形），默认 20 */
  size?: number
  /** stroke 颜色，默认 currentColor */
  color?: string
  /** 额外样式 */
  style?: CSSProperties
  /** 额外 className */
  className?: string
}

// ── 快捷记录 / 记录类型图标 ───────────────────────────────────────────────

/** 饮食/奶瓶 图标 */
export const IconMilk = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M8 2h8l1 6H7L8 2z"/>
    <path d="M7 8c0 0-1 1-1 4s1 10 6 10 6-7 6-10-1-4-1-4"/>
    <path d="M10 14s.5 1 2 1 2-1 2-1"/>
  </svg>
)

/** 睡眠/月亮 图标 */
export const IconMoon = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

/** 尿布/水滴 图标 */
export const IconDroplets = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>
  </svg>
)

/** 活动/脉搏 图标 */
export const IconActivity = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)

/** 生长/刻度尺 图标 */
export const IconRuler = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z"/>
    <line x1="7.5" y1="10.5" x2="9" y2="12"/>
    <line x1="10.5" y1="7.5" x2="12" y2="9"/>
    <line x1="13.5" y1="4.5" x2="15" y2="6"/>
  </svg>
)

/** 健康/心形 图标 */
export const IconHeart = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)

/** 医疗/听诊器 图标 */
export const IconStethoscope = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
    <circle cx="20" cy="10" r="2"/>
  </svg>
)

/** 表现/笑脸 图标 */
export const IconSmile = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)

// ── 通用交互图标 ────────────────────────────────────────────────────────────

/** 返回箭头（左） */
export const IconArrowLeft = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

/** 右箭头（列表条目导航） */
export const IconChevronRight = ({ size = 16, color = '#C0A8AD', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, flexShrink: 0, ...style }} className={className}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

/** 铅笔/编辑 */
export const IconPencil = ({ size = 14, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

/** 加号/新增 */
export const IconPlus = ({ size = 14, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

/** 关闭/X */
export const IconClose = ({ size = 16, color = '#fff', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

/** 复制 */
export const IconCopy = ({ size = 15, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)

/** 垃圾桶/删除 */
export const IconTrash = ({ size = 16, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

/** 退出登录 */
export const IconLogOut = ({ size = 18, color = '#F05060', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

// ── 设置类图标 ─────────────────────────────────────────────────────────────

/** 多用户/家庭成员 */
export const IconUsers = ({ size = 18, color = '#F0B8C8', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

/** 单个用户头像 */
export const IconUserSingle = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

/** 分享/邀请 */
export const IconShare = ({ size = 18, color = '#4CAF82', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)

/** 手机/版本号 */
export const IconPhone = ({ size = 18, color = '#F0B8C8', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
)

/** 文本/大字体 */
export const IconTextSize = ({ size = 18, color = '#F0B8C8', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polyline points="4 7 4 4 20 4 20 7"/>
    <line x1="9" y1="20" x2="15" y2="20"/>
    <line x1="12" y1="4" x2="12" y2="20"/>
  </svg>
)

/** 文件/文档 */
export const IconFileText = ({ size = 18, color = '#9A8090', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
)

// ── 报告图标 ────────────────────────────────────────────────────────────────

/** 柱状图 */
export const IconBarChart2 = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6"  y1="20" x2="6"  y2="14"/>
  </svg>
)

/** 趋势上升 */
export const IconTrendingUp = ({ size = 20, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
)

// ── 状态图标 ────────────────────────────────────────────────────────────────

/** 加载旋转 */
export const IconLoader = ({ size = 18, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, animation: 'spin 1s linear infinite', ...style }}
    className={className}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)

/** 警告三角 */
export const IconWarn = ({ size = 11, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
  </svg>
)

/** 信息圆圈 */
export const IconInfo = ({ size = 13, color = '#F87098', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)

/** 铃铛/通知 */
export const IconBell = ({ size = 14, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

/** 搜索 */
export const IconSearch = ({ size = 14, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

/** 相机 */
export const IconCamera = ({ size = 32, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

// ── 时间线 Pill 语义图标 ─────────────────────────────────────────────────────

/** 大便（树叶/自然） */
export const IconPoop = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M12 2a5 5 0 0 1 5 5c0 1.5-.6 2.8-1.5 3.8A5 5 0 0 1 17 15a5 5 0 0 1-10 0 5 5 0 0 1 1.5-3.6A5 5 0 0 1 7 7a5 5 0 0 1 5-5z"/>
    <path d="M9 20h6"/>
  </svg>
)

/** 小便/水滴（简化） */
export const IconDrop = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
)

/** 干净/叶子 */
export const IconLeaf = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M17 8C8 10 5.9 16.17 3.82 19.25c1.49.73 3.19 1.15 5 1.15 5.52 0 10-4.48 10-10 0-1.04-.16-2.04-.46-2.97A7.19 7.19 0 0 0 17 8z"/>
    <path d="M17 8C8 10 5.9 16.17 3.82 19.25"/>
  </svg>
)

/** 洗澡 */
export const IconBath = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
    <line x1="10" y1="5" x2="8" y2="7"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
  </svg>
)

/** 户外/太阳 */
export const IconSun = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

/** 玩耍/星形（玩具感） */
export const IconPlay2 = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)

/** 俯趴/婴儿 */
export const IconBaby = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="6" r="3"/>
    <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
  </svg>
)

/** 跑步/活动（通用） */
export const IconRun = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="13" cy="4" r="1"/>
    <path d="M7 21l4-4-2-4 4-4 2 2h4"/>
    <path d="M15 9l-3-3-3 5"/>
    <path d="M5 12l2-3"/>
  </svg>
)

/** 开心/笑脸 */
export const IconFaceHappy = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)

/** 平静/中性脸 */
export const IconFaceNeutral = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="8" y1="15" x2="16" y2="15"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)

/** 烦躁/皱眉 */
export const IconFaceFussy = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 15s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)

/** 哭闹/泪水 */
export const IconFaceCrying = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 15s-1.5-2-4-2-4 2-4 2"/>
    <path d="M9 9.5c0-.5-.5-1-1-1s-1 .5-1 1 .5 1 1 1 1-.5 1-1z" fill={color}/>
    <path d="M16 9.5c0-.5-.5-1-1-1s-1 .5-1 1 .5 1 1 1 1-.5 1-1z" fill={color}/>
    <path d="M8 13l-1 2"/>
    <path d="M16 13l1 2"/>
  </svg>
)

/** 医院/就诊 */
export const IconHospital = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
    <line x1="12" y1="7" x2="12" y2="11"/>
    <line x1="10" y1="9" x2="14" y2="9"/>
  </svg>
)

/** 体温计/温度 */
export const IconThermometer = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </svg>
)

/** 药片/胶囊 */
export const IconPill = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M10.5 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v.5"/>
    <path d="M18 21.3l3-3a2.12 2.12 0 0 0-3-3l-4.5 4.5a2.12 2.12 0 0 0 3 3z"/>
    <line x1="15" y1="18" x2="18" y2="15"/>
  </svg>
)

/** 警告/过敏 */
export const IconAlertTriangle = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

/** 精神活跃/闪电 */
export const IconZap = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)

/** 进行中/时钟 */
export const IconClock = ({ size = 12, color = 'currentColor', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, ...style }} className={className}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)

// ── 挥手图标（首页问候） ────────────────────────────────────────────────────
export const IconWave = ({ size = 16, color = 'rgba(255,255,255,0.9)', style, className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ width: size, height: size, verticalAlign: -3, display: 'inline', ...style }}
    className={className}>
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
  </svg>
)
