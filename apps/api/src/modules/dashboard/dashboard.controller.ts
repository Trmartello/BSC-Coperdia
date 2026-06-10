import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('executive')
  executive(@Query('period') period: string, @Query('scenarioId') scenarioId?: string) {
    return this.service.getExecutiveDashboard(new Date(period), scenarioId);
  }

  @Get('audit-log')
  auditLog(@Query('limit') limit?: string) {
    return this.service.getAuditLog(limit ? parseInt(limit) : 50);
  }
}
