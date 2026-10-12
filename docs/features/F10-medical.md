# F10 · 就医记录

> 功能 ID：P0-012  
> 优先级：P0  
> 状态：**已完成** ✅  
> 最后更新：2026-10-12（上传画质修复：报告图片不再双重压缩；原图选择 + 2560px/92 高画质压缩）
>
> 更新历史：
> - 2026-08-20：医疗图片由 OCR mock 改为真实图片上传（COS 直传 + photo_ids 留档，不做 OCR）
> - 2026-08-22：~~OCR 功能前端有入口但尚未完整实现（mock 数据流），识别结果填入结构化字段，不单独持久化 ocr_text。~~
>   2026-08-20 起医疗记录不再做 OCR：图片仅上传留档（photo_ids 存 CloudBase fileID），结构化字段由用户手动填写。
> - 2026-08-22：医疗表单移除用药记录区块（已有专门 F14 用药记录功能）；新增检查时间 visit_time（HH:mm，可选，Migration 014）。
> - 2026-08-22：今日时间线（`/records/today`）medical detail 补齐 `visit_type` 字段，时间线与记录列表展示就诊类型标签（`VISIT_TYPE_LABELS`）。
> - **2026-10-12：修复报告图片「双重压缩致糊」**——`PhotoSection` 选图改 `sizeType=['original']`（不再叠加微信端预处理压缩），
>   压缩参数从 1280px/80 提为 **2560px/quality 92**（诊断报告文字可读性优先）。

## 功能描述

记录宝宝的就医情况，包括就诊类型、医院/医生、诊断结果和复查日期。支持拍照上传检查单。

**平台实现**：微信小程序（主平台），数据通过 REST API 存入远程 MySQL。

## 就诊类型（visit_type）

4 种选项，2 列网格布局（2026-08-22 精简，见下方废弃说明）：

| 枚举值 | 中文标签 |
|--------|----------|
| `checkup` | 儿保检查 |
| `sick` | 就诊记录 |
| `vaccine` | 疫苗接种 |
| `other` | 其他检查 |

> **废弃类型（2026-08-22）**：`allergy`（过敏原检测，低频）、`blood`（血液检查，与 other 重复）已从选项移除。
> 老数据（VARCHAR 存储）读取/列表展示不受影响（`VISIT_TYPE_LABELS` 保留标签映射）；
> 编辑老记录时前端将这两个值归一为 `other` 后再提交；后端 `@IsEnum` 已收紧为 4 值。

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
| `visit_time` | string | 否 | HH:mm（可选，2026-08-22 新增，Migration 014） |
| `visit_type` | VisitType enum | 否 | 4 种就诊类型 |
| `hospital` | string | 否 | 医院名称（≤100字） |
| `doctor` | string | 否 | 医生姓名（≤50字） |
| `diagnosis` | string | 否 | 诊断结论 |
| `result_summary` | string | 否 | 结果摘要 |
| `medications` | MedicationItemDto[] | 否 | 用药列表 [{name, dose?}]（**已废弃**：表单不再录入，字段保留兼容老数据） |
| `photo_ids` | string[] | 否 | 照片 fileID 数组 |
| `follow_up_date` | string | 否 | 下次复查日期 YYYY-MM-DD |
| `follow_up_time` | string | 否 | 下次复查时间 HH:mm（可选，2026-08-22 新增，Migration 015） |
| `note` | string | 否 | 备注（**已废弃**：表单已移除，字段保留兼容老数据） |

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
| `VisitTypeSection.tsx` | 就诊类型 2 列网格选择（4 种） |
| `BasicInfoSection.tsx` | 检查日期（友好格式）+ 检查时间（可选）+ 医院 + 医生 |
| `PhotoSection.tsx` | 图片上传（拍照/相册，COS 直传，≤6 张，预览/删除/失败重试，编辑回显） |
| `ResultSection.tsx` | 结果摘要 + 诊断结论 |
| `FollowUpSection.tsx` | 复查日期 + 复查时间选择（无开关，可选填） |

## 下次复查提醒（2026-08-22 调整）

- 不做系统通知/本地提醒；填写复查日期后，**首页展示「下次复查提醒」横幅**（用户每天打开小程序即可看到），**过期后自动不再展示**
- 复查可填日期 + 时间（如「8月30日 08:00」），横幅完整展示
- 后端接口：`GET /api/family/:familyId/records/medical/next-follow-up?baby_id=xxx`
  - 只返回未过期（`follow_up_date >= 今天`）的最近一条复查计划；过期或无计划返回 `null`
- 首页横幅：`NextFollowUpBanner.tsx`，点击进入对应医疗记录编辑页

> 用药记录（MedicationsSection）已于 2026-08-22 移除，用药请走专门 F14 模块。

## 展示层影响面（2026-08-22 核对）

| 消费点 | 展示内容 | 数据来源 |
|--------|----------|----------|
| 今日时间线（首页） | label「医疗」+ 就诊类型标签（如「儿保检查」） | `GET /records/today` → medical detail.`visit_type`（已补齐，`family.service.ts getTodayRecords`） |
| 记录列表页 | label「医疗」+ 类型/医院/诊断 tags | feed 接口 → `record_timeline` 物化 summary_tags（016 迁移已补全展示文案：就诊类型 label + 医院 + 诊断；`timeline.service.ts loadMedicalPayload` 同步输出） |
| 表单页编辑回显 | 就诊类型选中态（blood/allergy 归一为 other） | `getOne` 接口 |

> 前端标签映射统一走 `minicare-mp/src/lib/constants.ts` 的 `VISIT_TYPE_LABELS`（含废弃类型 allergy/blood 兜底展示）。

## 图片上传流程说明

2026-08-20 起医疗记录**不做 OCR**，图片仅留档保存：

1. 用户拍照/从相册选择图片（最多 6 张，选中即传）
   - **选图用原图**（`sizeType=['original']`）——`compressed` 会先被微信压一轮，报告文字必糊（2026-10-12 修复）
2. 上传前本地压缩：**2560px 宽 + quality 92**（2026-10-12 画质调优；原 1280px/80 对 A4 报告文字损失过大），压缩失败回退原图
3. 前端调 `POST /api/storage/upload-url` 获取 COS 预签名 URL + fileID
4. 读文件字节后 `Taro.request` PUT 直传 COS（**不能 `Taro.uploadFile`**——multipart 表单会污染文件内容，2026-08-22 踩坑）
5. 上传成功后将 fileID 存入 `photo_ids`，随记录一并提交
6. 编辑记录时按 `photo_ids` 调 `POST /api/storage/download-urls` 拉取临时链接回显
7. 上传失败可点击重试；删除图片仅从记录中移除（云端文件保留）

> 与 Web 端差异：Web 端仍为 OCR mock 流程（维护模式，待同步）。
> 压缩参数同时作用于 H5 端（`lib/uploadImage.h5.ts` canvas 实现，语义一致）。

## 验收标准（AC）

- [x] 4 种就诊类型选择（2026-08-22 精简，allergy/blood 废弃）
- [x] 基础信息输入（日期/时间/医院/医生，日期友好展示，时间可选）
- [x] 诊断结论和结果摘要
- [x] 照片上传（photo_ids，COS 直传留档，不做 OCR；≤6 张，失败重试，编辑回显）
- [x] **报告图片高画质压缩（原图选择 + 2560px/92），文字清晰可读**（2026-10-12 修复双重压缩）
- [x] 复查日期 + 复查时间选择（可选，无开关，首页常驻展示，过期自动消失）
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
