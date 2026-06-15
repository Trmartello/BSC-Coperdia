import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ActionPlansController } from './action-plans.controller';
import { ActionPlansService } from './action-plans.service';

@Module({
  imports: [MulterModule.register({ dest: './uploads' })],
  controllers: [ActionPlansController],
  providers: [ActionPlansService],
  exports: [ActionPlansService],
})
export class ActionPlansModule {}
