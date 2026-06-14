import {
  Controller, Get, Post, Delete, Body, Param, Patch, Query, UseGuards, Request,
  Header, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  // Modelo de planilha (CSV) para carga de dados — apenas indicadores de entrada
  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="modelo_carga_indicadores.csv"')
  getImportTemplate() {
    return this.service.generateImportTemplate();
  }

  // Carga de dados via planilha: ADMIN e CONTROLADORIA
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importData(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('Envie um arquivo CSV (use a planilha modelo)');
    return this.service.importRealizedValues(file.buffer.toString('utf-8'), req.user.id);
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

  // Conexões da árvore de impacto: ADMIN e CONTROLADORIA
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post('relations')
  addRelation(@Body() body: { parentId: string; childId: string }, @Request() req: any) {
    return this.service.addRelation(body.parentId, body.childId, req.user.id);
  }

  @Roles('ADMIN', 'CONTROLADORIA')
  @Delete('relations')
  removeRelation(@Body() body: { parentId: string; childId: string }, @Request() req: any) {
    return this.service.removeRelation(body.parentId, body.childId, req.user.id);
  }

  // Simulação/projeção: ADMIN, CONTROLADORIA e GESTOR
  @Roles('ADMIN', 'CONTROLADORIA', 'GESTOR')
  @Patch('forecast')
  updateForecast(@Body() dto: UpdateForecastDto, @Request() req: any) {
    return this.service.updateForecast(dto, req.user.id);
  }

  // Carga/correção de valor realizado (carga de dados): ADMIN e CONTROLADORIA
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post(':id/realized')
  setRealized(
    @Param('id') id: string,
    @Body() body: { period: string; value: number },
    @Request() req: any,
  ) {
    return this.service.setRealized(id, body.period, body.value, req.user.id);
  }

  // Lançamento de estimativa (forecast baseline): ADMIN, CONTROLADORIA e GESTOR
  @Roles('ADMIN', 'CONTROLADORIA', 'GESTOR')
  @Post(':id/estimate')
  setEstimate(
    @Param('id') id: string,
    @Body() body: { period: string; value: number },
    @Request() req: any,
  ) {
    return this.service.setEstimate(id, body.period, body.value, req.user.id);
  }

  // Definição de meta: ADMIN e CONTROLADORIA
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post(':id/goal')
  setGoal(
    @Param('id') id: string,
    @Body() body: { period: string; value: number },
    @Request() req: any,
  ) {
    return this.service.setGoal(id, body.period, body.value, req.user.id);
  }
}
