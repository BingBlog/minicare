import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 全局 Date → 北京时间字符串 转换拦截器
 *
 * 生效时机：每个 HTTP 响应返回前，递归替换所有 Date 实例为北京时间字符串
 *
 * 输出格式：'YYYY-MM-DDTHH:mm:ss+08:00'（ISO 8601 + 时区后缀）
 * 示例：    2026-05-08T14:30:00+08:00
 *
 * 注册方式：main.ts 中 `app.useGlobalInterceptors(new DateTransformInterceptor())`
 *
 * 前端兼容性：dayjs('2026-05-08T14:30:00+08:00').format('HH:mm') → '14:30'
 */
@Injectable()
export class DateTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.transform(data)));
  }

  private transform(value: unknown): unknown {
    if (value instanceof Date) {
      return this.formatBeijing(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        result[key] = this.transform((value as Record<string, unknown>)[key]);
      }
      return result;
    }
    return value;
  }

  private formatBeijing(d: Date): string {
    // process.env.TZ = 'Asia/Shanghai' 已生效，get*() 返回北京时间分量
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${mi}:${s}+08:00`;
  }
}
