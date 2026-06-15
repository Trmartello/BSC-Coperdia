import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  @Get('flags')
  getFlags() {
    return this.settingsService.getFlags();
  }

  @Roles('ADMIN')
  @Patch('flags')
  setFlag(@Body() body: { key: string; value: any }, @Request() req: any) {
    return this.settingsService.setFlag(body.key, body.value, req.user.id);
  }

  @Get('indicators')
  getIndicators() {
    return this.settingsService.getIndicators();
  }

  @Roles('ADMIN')
  @Post('indicators')
  createIndicator(@Body() body: any, @Request() req: any) {
    return this.settingsService.createIndicator(body, req.user.id);
  }

  @Roles('ADMIN')
  @Patch('indicators/:id')
  updateIndicator(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.settingsService.updateIndicator(id, body, req.user.id);
  }

  @Roles('ADMIN')
  @Delete('indicators/:id')
  deleteIndicator(@Param('id') id: string, @Request() req: any) {
    return this.settingsService.deleteIndicator(id, req.user.id);
  }

  @Get('maps')
  getMaps() {
    return this.settingsService.getMaps();
  }

  @Get('categories')
  getCategories() {
    return this.settingsService.getCategories();
  }

  @Roles('ADMIN')
  @Post('categories')
  createCategory(@Body() body: any, @Request() req: any) {
    return this.settingsService.createCategory(body, req.user.id);
  }

  @Roles('ADMIN')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.settingsService.updateCategory(id, body);
  }

  @Roles('ADMIN')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.settingsService.deleteCategory(id);
  }
}
