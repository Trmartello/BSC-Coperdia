import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ActionPlansService,
  CreatePlanDto,
  UpdatePlanDto,
  CreateInitiativeDto,
  UpdateInitiativeDto,
  CreateActionItemDto,
  UpdateActionItemDto,
  CreateCommentDto,
} from './action-plans.service';

@ApiTags('action-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('action-plans')
export class ActionPlansController {
  constructor(private readonly service: ActionPlansService) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  @Get('dashboard')
  dashboard() {
    return this.service.getDashboard();
  }

  @Get()
  findAll(
    @Query('indicatorId') indicatorId?: string,
    @Query('standalone') standalone?: string,
    @Request() req?: any,
  ) {
    return this.service.findAll({
      indicatorId,
      standalone: standalone === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  // Plano vinculado a indicador (problema implícito): get-or-create canônico
  @Post('indicator/:indicatorId/ensure')
  ensureForIndicator(@Param('indicatorId') indicatorId: string, @Request() req: any) {
    return this.service.ensureForIndicator(indicatorId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @Request() req: any) {
    return this.service.update(id, dto, req.user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.delete(id, req.user.id);
  }

  // ── Initiatives ────────────────────────────────────────────────────────────

  @Post(':id/initiatives')
  createInitiative(@Param('id') id: string, @Body() dto: CreateInitiativeDto, @Request() req: any) {
    return this.service.createInitiative(id, dto, req.user.id);
  }

  @Patch('initiatives/:initiativeId')
  updateInitiative(@Param('initiativeId') id: string, @Body() dto: UpdateInitiativeDto, @Request() req: any) {
    return this.service.updateInitiative(id, dto, req.user.id);
  }

  @Delete('initiatives/:initiativeId')
  deleteInitiative(@Param('initiativeId') id: string, @Request() req: any) {
    return this.service.deleteInitiative(id, req.user.id);
  }

  // ── Action Items ───────────────────────────────────────────────────────────

  @Post('initiatives/:initiativeId/actions')
  createAction(@Param('initiativeId') id: string, @Body() dto: CreateActionItemDto, @Request() req: any) {
    return this.service.createActionItem(id, dto, req.user.id);
  }

  @Patch('actions/:itemId')
  updateAction(@Param('itemId') id: string, @Body() dto: UpdateActionItemDto, @Request() req: any) {
    return this.service.updateActionItem(id, dto, req.user.id);
  }

  @Delete('actions/:itemId')
  deleteAction(@Param('itemId') id: string, @Request() req: any) {
    return this.service.deleteActionItem(id, req.user.id);
  }

  // ── Comments (com anexo opcional via multipart) ──────────────────────────────

  @Post(':id/comments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() req: any,
  ) {
    const payload: CreateCommentDto = { content: dto.content ?? '' };
    if (file) {
      payload.attachmentUrl = `/uploads/${file.filename}`;
      payload.attachmentName = file.originalname;
      payload.attachmentSize = file.size;
      payload.attachmentMime = file.mimetype;
    }
    return this.service.addComment(id, payload, req.user.id);
  }

  @Delete(':id/comments/:commentId')
  deleteComment(@Param('id') id: string, @Param('commentId') cid: string, @Request() req: any) {
    return this.service.deleteComment(id, cid, req.user.id);
  }

  // ── Attachments (upload via multipart) ────────────────────────────────────

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.service.addAttachment(
      id,
      {
        filename: file.originalname,
        url: `/uploads/${file.filename}`,
        size: file.size,
        mimeType: file.mimetype,
      },
      req.user.id,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  deleteAttachment(@Param('id') id: string, @Param('attachmentId') aid: string, @Request() req: any) {
    return this.service.deleteAttachment(id, aid, req.user.id);
  }
}
