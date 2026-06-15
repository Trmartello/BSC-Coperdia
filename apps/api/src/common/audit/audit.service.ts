import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'SIMULATE';

export interface AuditInput {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  scenarioId?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // Registra um evento de auditoria. Nunca lança — auditoria não pode
  // derrubar a operação de negócio principal.
  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          before: input.before ?? undefined,
          after: input.after ?? undefined,
          scenarioId: input.scenarioId,
          ipAddress: input.ipAddress,
        },
      });
    } catch (err) {
      this.logger.error('Falha ao gravar auditoria', err as Error);
    }
  }
}
