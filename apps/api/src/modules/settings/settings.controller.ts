import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  @Get('indicators')
  getIndicators() {
    return this.settingsService.getIndicators();
  }

  @Post('indicators')
  createIndicator(@Body() body: any) {
    return this.settingsService.createIndicator(body);
  }

  @Patch('indicators/:id')
  updateIndicator(@Param('id') id: string, @Body() body: any) {
    return this.settingsService.updateIndicator(id, body);
  }

  @Delete('indicators/:id')
  deleteIndicator(@Param('id') id: string) {
    return this.settingsService.deleteIndicator(id);
  }

  @Get('maps')
  getMaps() {
    return this.settingsService.getMaps();
  }

  @Get('categories')
  getCategories() {
    return this.settingsService.getCategories();
  }

  @Post('categories')
  createCategory(@Body() body: any, @Request() req: any) {
    return this.settingsService.createCategory(body, req.user.sub);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: any) {
    return this.settingsService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.settingsService.deleteCategory(id);
  }
}
