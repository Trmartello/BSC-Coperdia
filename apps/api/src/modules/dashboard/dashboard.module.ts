import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CalcEngineModule } from '../calc-engine/calc-engine.module';

@Module({ imports: [CalcEngineModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
