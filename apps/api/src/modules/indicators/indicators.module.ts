import { Module } from '@nestjs/common';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { BalanceteImportService } from './balancete-import.service';
import { CalcEngineModule } from '../calc-engine/calc-engine.module';

@Module({
  imports: [CalcEngineModule],
  controllers: [IndicatorsController],
  providers: [IndicatorsService, BalanceteImportService],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
