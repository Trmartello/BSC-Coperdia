import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FormulasService, UpsertFormulaDto } from './formulas.service';

@ApiTags('formulas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('formulas')
export class FormulasController {
  constructor(private readonly service: FormulasService) {}

  @Post()
  upsert(@Body() dto: UpsertFormulaDto) {
    return this.service.upsert(dto);
  }

  @Post('validate')
  validate(@Body() body: { expression: string; variables: Record<string, string> }) {
    return this.service.validate(body.expression, body.variables);
  }

  @Get(':indicatorId')
  findOne(@Param('indicatorId') id: string) {
    return this.service.findByIndicator(id);
  }

  @Delete(':indicatorId')
  delete(@Param('indicatorId') id: string) {
    return this.service.delete(id);
  }
}
