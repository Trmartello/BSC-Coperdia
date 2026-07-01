import {
  Controller, Get, Post, Delete, Body, Param, Patch, Query, UseGuards, Request,
  Header, Res, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IndicatorsService } from './indicators.service';
import { BalanceteImportService } from './balancete-import.service';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';

@ApiTags('indicators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('indicators')
export class IndicatorsController {
  constructor(
    private readonly service: IndicatorsService,
    private readonly balancete: BalanceteImportService,
  ) {}

  @Get('periods')
  getAvailablePeriods() {
    return this.service.getAvailablePeriods();
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('tree')
  getTree(@Query('rootId') rootId?: string) {
    return this.service.getTree(rootId);
  }

  // Modelo Excel (.xlsx) para carga de dados
  @Get('import/template')
  async getImportTemplate(@Res() res: Response) {
    const buf = await this.service.generateImportTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo_carga_bsc.xlsx"',
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  // Carga completa via planilha Excel (Realizados + Metas + Estimativas)
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importData(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('Envie o arquivo Excel gerado pelo modelo.');
    return this.service.importSpreadsheet(file.buffer, req.user.id);
  }

  // Importa o balancete (N1/N2/N3 + colunas mensais) → indicadores de nível
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post('import-balancete')
  @UseInterceptors(FileInterceptor('file'))
  importBalancete(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('Envie a planilha do balancete (.xlsx).');
    return this.balancete.importBalancete(file.buffer, req.user.id);
  }

  // Gera índices financeiros de análise (Liquidez, Endividamento…) sobre o balancete
  @Roles('ADMIN', 'CONTROLADORIA')
  @Post('generate-ratios')
  generateRatios(@Request() req: any) {
    return this.balancete.generateFinancialRatios(req.user.id);
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
