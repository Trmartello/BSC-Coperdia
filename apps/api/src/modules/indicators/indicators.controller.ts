import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IndicatorsService } from './indicators.service';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';

@ApiTags('indicators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly service: IndicatorsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('tree')
  getTree(@Query('rootId') rootId?: string) {
    return this.service.getTree(rootId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/impact-chain')
  getImpactChain(@Param('id') id: string) {
    return this.service.getImpactChain(id);
  }

  // Configuração de indicador: somente ADMIN
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateIndicatorDto) {
    return this.service.create(dto);
  }

  // Simulação/projeção: ADMIN, CONTROLADORIA e GESTOR
  @Roles('ADMIN', 'CONTROLADORIA', 'GESTOR')
  @Patch('forecast')
  updateForecast(@Body() dto: UpdateForecastDto, @Request() req: any) {
    return this.service.updateForecast(dto, req.user.id);
  }
}
