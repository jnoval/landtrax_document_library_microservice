import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditTrailService } from '../contracts/audit-trail.service.abstract.js';
import { AUDIT_DESCRIPTION_KEY } from '../decorators/audit-description.decorator.js';
import { AUDIT_RESOURCE_KEY } from '../decorators/audit.decorator.js';

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditTrailInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrailService?: AuditTrailService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const handler = context.getHandler();
    const targetClass = context.getClass();

    const resource =
      this.reflector.get<string>(AUDIT_RESOURCE_KEY, handler) ||
      this.reflector.get<string>(AUDIT_RESOURCE_KEY, targetClass);

    const descriptionTemplate = this.reflector.get<string>(
      AUDIT_DESCRIPTION_KEY,
      handler,
    );

    if (!resource && !descriptionTemplate) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((response) => {
        if (!this.auditTrailService) return;

        try {
          const rawUserId = request.user?.id || request.headers?.['x-user-id'] || null;
          const userId:string | null =
            !rawUserId || String(rawUserId).toLowerCase() === 'system'
              ? null
              : String(rawUserId);
          const ip = request.ip || request.connection?.remoteAddress || '127.0.0.1';
          const entity = resource || 'Document Library';
          const action = request.method
            ? this.mapToAuditAction(request.method)
            : handler.name;

          let details = descriptionTemplate || `${action} performed on ${entity}`;
          const responseData =
            response && typeof response === 'object'
              ? response.data && typeof response.data === 'object' && !Array.isArray(response.data)
                ? { ...response, ...response.data }
                : response
              : {};

          const metadata: Record<string, any> = {
            ...responseData,
            ...request.body,
            ...(request.params),
            ...(request.auditMetadata),
          };

          for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string' || typeof value === 'number') {
              details = details.replace(new RegExp(String.raw`\{${key}\}`, 'g'), String(value));
            }
          }

          void this.auditTrailService.create({
            userId: userId || '',
            action,
            entity,
            details,
            result: 'SUCCESS',
            ip,
          });
        } catch (err: unknown) {
          this.logger.debug(`Audit trail recording skipped: ${(err as Error)?.message}`);
        }
      }),
    );
  }

  private mapToAuditAction(method: string): string {
    switch (method.toUpperCase()) {
      case 'POST':
        return 'CREATE';
      case 'PUT':
      case 'PATCH':
        return 'UPDATE';
      case 'DELETE':
        return 'DELETE';
      case 'GET':
      default:
        return 'VIEWED';
    }
  }
}
