import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * 全局响应格式统一拦截器
 *
 * 所有正常返回的数据包装为：
 * { success: true, data: ..., timestamp: "..." }
 *
 * 在 main.ts 中通过 app.useGlobalInterceptors(new ResponseFormatInterceptor()) 注册
 */
@Injectable()
export class ResponseFormatInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
