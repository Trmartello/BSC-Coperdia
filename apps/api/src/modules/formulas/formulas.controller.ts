import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FormulasService, UpsertFormulaDto } from './formulas.service';

@ApiTags('formulas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('formulas')
export class FormulasController {
  constructor(private readonly service: FormulasService) {}

  @Roles('ADMIN')
  @Post()
  upsert(@Body() dto: UpsertFormulaDto, @Request() req: any) {
    return this.service.upsert(dto, req.user.id);
  }

  @Roles('ADMIN')
  @Post('validate')
  validate(@Body() body: { expression: string; variables: Record<string, string> }) {
    return this.service.validate(body.expression, body.variables);
  }

  @Get(':indicatorId')
  findOne(@Param('indicatorId') id: string) {
    return this.service.findByIndicator(id);
  }

  @Roles('ADMIN')
  @Delete(':indicatorId')
  delete(@Param('indicatorId') id: string, @Request() req: any) {
    return this.service.delete(id, req.user.id);
  }
}
