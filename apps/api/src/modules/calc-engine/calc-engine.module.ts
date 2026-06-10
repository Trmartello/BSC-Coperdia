import { Module } from '@nestjs/common';
import { CalcEngineService } from './calc-engine.service';

@Module({ providers: [CalcEngineService], exports: [CalcEngineService] })
export class CalcEngineModule {}
