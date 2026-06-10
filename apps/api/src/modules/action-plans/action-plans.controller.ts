import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActionPlansService, CreateActionPlanDto } from './action-plans.service';

@ApiTags('action-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('action-plans')
export class ActionPlansController {
  constructor(private readonly service: ActionPlansService) {}

  @Get()
  findAll(@Query('indicatorId') indicatorId: string, @Request() req: any) {
    if (indicatorId) return this.service.findByIndicator(indicatorId);
    return this.service.findAll(req.user.id);
  }

  @Post()
  create(@Body() dto: CreateActionPlanDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
