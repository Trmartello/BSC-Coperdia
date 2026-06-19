import { Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  // Lista os alertas do sino + contagem de não lidos para o usuário logado
  @Get()
  list(@Request() req: any) {
    return this.service.getForUser(req.user);
  }

  // Marca um alerta como lido
  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  // Marca todos os alertas visíveis como lidos
  @Post('read-all')
  markAllRead(@Request() req: any) {
    return this.service.markAllRead(req.user);
  }

  // Dispara manualmente o envio de e-mails de ações em atraso (admin / teste)
  @Post('trigger-overdue')
  async triggerOverdue() {
    const sent = await this.service.notifyOverdueActions();
    return { sent };
  }
}
