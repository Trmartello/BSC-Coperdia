import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { CalcEngineModule } from '../calc-engine/calc-engine.module';

@Module({ imports: [CalcEngineModule], controllers: [MapsController], providers: [MapsService] })
export class MapsModule {}
