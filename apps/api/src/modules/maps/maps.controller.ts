import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MapsService } from './maps.service';

@ApiTags('maps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('maps')
export class MapsController {
  constructor(private readonly service: MapsService) {}

  // ── Categories ─────────────────────────────────────────────────────────────
  @Get('categories')
  getCategories() { return this.service.getCategories(); }

  @Post('categories')
  createCategory(@Body() body: { name: string; color?: string }, @Request() req: any) {
    return this.service.createCategory(body, req.user.id);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.service.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  // ── Maps ───────────────────────────────────────────────────────────────────
  @Get()
  findAll(@Query('categoryId') categoryId?: string) {
    return this.service.findAll(categoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() body: { name: string; description?: string; categoryId: string }, @Request() req: any) {
    return this.service.create(body, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) { return this.service.delete(id); }

  @Post(':id/layout')
  saveLayout(@Param('id') id: string, @Body() body: { nodes: any[]; edges: any[] }) {
    return this.service.saveLayout(id, body);
  }

  @Post(':id/indicators')
  addIndicator(
    @Param('id') id: string,
    @Body() body: { indicatorId: string; position?: { x: number; y: number } },
  ) {
    return this.service.addIndicator(id, body.indicatorId, body.position);
  }

  @Delete(':id/indicators/:indicatorId')
  removeIndicator(@Param('id') id: string, @Param('indicatorId') indId: string) {
    return this.service.removeIndicator(id, indId);
  }
}
