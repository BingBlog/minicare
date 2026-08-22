import { Inject, Injectable } from '@nestjs/common';
import { CLOUDBASE_APP } from '../common/cloudbase/cloudbase.module';

@Injectable()
export class StorageService {
  constructor(@Inject(CLOUDBASE_APP) private readonly tcb: any) {}

  /**
   * 获取临时上传 URL（客户端直传）
   *
   * 客户端使用 PUT 请求将文件上传到 uploadUrl，完成后将 fileID 存入业务记录。
   *
   * @param cloudPath 存储路径，如 "medical/{babyId}/{recordId}/1.jpg"
   */
  async getUploadUrl(cloudPath: string): Promise<{
    fileID: string
    uploadUrl: string
    cosToken: string
    signature: string
    cosFileId: string
  }> {
    // CloudBase Node SDK v3：getUploadMetadata 获取预签名上传元数据（SDK 无 getUploadFileInfo 方法）
    const result = await this.tcb.getUploadMetadata({ cloudPath });
    const data = result?.data;
    if (!data?.url || !data?.fileId || !data?.authorization) {
      throw new Error(`获取上传元数据失败: ${JSON.stringify(result)}`);
    }
    return {
      fileID: data.fileId,
      uploadUrl: data.url,
      cosToken: data.token ?? '',
      signature: data.authorization,
      cosFileId: data.cosFileId ?? '',
    };
  }

  /**
   * 获取临时下载 URL（有效期 1 小时）
   *
   * @param fileIDs 存储 fileID 列表
   */
  async getTempDownloadUrls(fileIDs: string[]): Promise<Array<{ fileID: string; tempFileURL: string }>> {
    const result = await this.tcb.getTempFileURL({
      fileList: fileIDs.map((fileID) => ({ fileID, maxAge: 3600 })),
    });
    return result.fileList ?? [];
  }

  /**
   * 删除文件
   */
  async deleteFiles(fileIDs: string[]): Promise<void> {
    await this.tcb.deleteFile({ fileList: fileIDs });
  }
}
