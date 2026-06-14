import { Module } from '@nestjs/common';
import { FormulasController } from './formulas.controller';
import { FormulasService } from './formulas.service';
import { CalcEngineModule } from '../calc-engine/calc-engine.module';

@Module({ imports: [CalcEngineModule], controllers: [FormulasController], providers: [FormulasService] })
export class FormulasModule {}
