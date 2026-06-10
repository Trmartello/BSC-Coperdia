import { Module } from '@nestjs/common';
import { FormulasController } from './formulas.controller';
import { FormulasService } from './formulas.service';

@Module({ controllers: [FormulasController], providers: [FormulasService] })
export class FormulasModule {}
