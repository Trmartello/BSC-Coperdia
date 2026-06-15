import { Controller, Get, Post, Body, Param, Patch, UseGuards, Request, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ScenariosService, CreateScenarioDto } from './scenarios.service';

@ApiTags('scenarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.id);
  }

  @Get('compare')
  compare(@Query('base') base: string, @Query('compare') compare: string) {
    return this.service.compare(base, compare);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/impact-map')
  getImpactMap(@Param('id') id: string) {
    return this.service.getImpactMap(id);
  }

  @Roles('ADMIN', 'CONTROLADORIA')
  @Post()
  create(@Body() dto: CreateScenarioDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Roles('ADMIN', 'CONTROLADORIA')
  @Post(':id/recalculate')
  recalculate(@Param('id') id: string) {
    return this.service.recalculate(id);
  }

  @Roles('ADMIN', 'CONTROLADORIA')
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }
}
