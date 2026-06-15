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
  executive(@Query('period') period?: string, @Query('scenarioId') scenarioId?: string) {
    const parsed = period ? new Date(period) : undefined;
    const validPeriod = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
    return this.service.getExecutiveDashboard(validPeriod, scenarioId);
  }

  @Get('audit-log')
  auditLog(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
    return this.service.getAuditLog(safeLimit);
  }
}
