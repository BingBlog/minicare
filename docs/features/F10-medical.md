# F10 · 就医记录

> 功能 ID：P0-012  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-08-20（医疗图片由 OCR mock 改为真实图片上传：COS 直传 + photo_ids 留档，不做 OCR）
>
> **注意**：~~OCR 功能前端有入口但尚未完整实现（mock 数据流），识别结果填入结构化字段，不单独持久化 ocr_text。~~
> 2026-08-20 起医疗记录不再做 OCR：图片仅上传留档（photo_ids 存 CloudBase fileID），结构化字段由用户手动填写。

## 功能描述

记录宝宝的就医情况，包括就诊类型、医院/医生、诊断结果、用药和复查日期。支持拍照上传检查单。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 就诊类型（visit_type）

6 种选项，2 列网格布局：

| 枚举值 | 中文标签 |
|--------|----------|
| `checkup` | 儿保检查 |
| `allergy` | 过敏原检测 |
| `sick` | 就诊记录 |
| `vaccine` | 疫苗接种 |
| `blood` | 血液检查 |
| `other` | 其他检查 |

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/family/:familyId/records/medical` | POST | 创建就医记录 |
| `/api/family/:familyId/records/medical` | GET | 查询就医记录列表 |
| `/api/family/:familyId/records/medical/:id` | PATCH | 更新记录 |
| `/api/family/:familyId/records/medical/:id` | DELETE | 删除记录 |

## DTO 字段

**CreateMedicalDto**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baby_id` | UUID string | 是 | 宝宝 UUID |
| `visit_date` | string | 是 | YYYY-MM-DD |
| `visit_type` | VisitType enum | 否 | 6 种就诊类型 |
| `hospital` | string | 否 | 医院名称（≤100字） |
| `doctor` | string | 否 | 医生姓名（≤50字） |
| `diagnosis` | string | 否 | 诊断结论 |
| `result_summary` | string | 否 | 结果摘要 |
| `medications` | MedicationItemDto[] | 否 | 用药列表 [{name, dose?}] |
| `photo_ids` | string[] | 否 | 照片 fileID 数组 |
| `follow_up_date` | string | 否 | 下次复查日期 YYYY-MM-DD |
| `note` | string | 否 | 备注 |

> 注：字段名为 `photo_ids`（存储 CloudBase fileID），不是 `photo_paths`。
> 不存在 `ocr_text` 字段。

### MedicationItemDto

```typescript
{ name: string; dose?: string }
```

示例：`[{"name":"布洛芬","dose":"5ml"},{"name":"头孢","dose":"1粒"}]`

## 前端组件结构

| 组件 | 功能 |
|------|------|
| `VisitTypeSection.tsx` | 就诊类型 2 列网格选择 |
| `BasicInfoSection.tsx` | 日期 + 医院 + 医生 |
| `PhotoSection.tsx` | 图片上传（拍照/相册，COS 直传，≤6 张，预览/删除/失败重试，编辑回显） |
| `ResultSection.tsx` | 结果摘要 + 诊断结论 |
| `MedicationsSection.tsx` | 用药列表动态增删 |
| `FollowUpSection.tsx` | 复查日期开关 + 日期选择器 |

## 图片上传流程说明

2026-08-20 起医疗记录**不做 OCR**，图片仅留档保存：

1. 用户拍照/从相册选择图片（最多 6 张，选中即传）
2. 前端调 `POST /api/storage/upload-url` 获取 COS 预签名 URL + fileID
3. 客户端 `Taro.uploadFile`（PUT）直传 COS
4. 上传成功后将 fileID 存入 `photo_ids`，随记录一并提交
5. 编辑记录时按 `photo_ids` 调 `POST /api/storage/download-urls` 拉取临时链接回显
6. 上传失败可点击重试；删除图片仅从记录中移除（云端文件保留）

> 与 Web 端差异：Web 端仍为 OCR mock 流程（维护模式，待同步）。

## 验收标准（AC）

- [x] 6 种就诊类型选择
- [x] 基础信息输入（日期/医院/医生）
- [x] 诊断结论和结果摘要
- [x] 用药列表动态增删
- [x] 照片上传（photo_ids，COS 直传留档，不做 OCR；≤6 张，失败重试，编辑回显）
- [x] 复查日期开关和日期选择
- [x] 提交后 Toast 提示并返回上一页
- [x] 支持编辑和删除已有记录

## 相关文件

- 就医表单：`minicare-mp/src/pages/records/medical/index.tsx`
- 各分区组件：`minicare-mp/src/pages/records/medical/*.tsx`
- 图片上传组件：`minicare-mp/src/pages/records/medical/PhotoSection.tsx`
- 云存储 API：`minicare-mp/src/api/storage.ts`
- API 模块：`minicare-mp/src/api/medical.ts`
- 服务端：`minicare-server/src/records/medical/`
- 云存储服务：`minicare-server/src/storage/`
- DTO：`minicare-server/src/records/medical/dto/create-medical.dto.ts`
