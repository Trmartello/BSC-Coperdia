import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluate } from 'mathjs';

export interface UpsertFormulaDto {
  indicatorId: string;
  expression: string;
  variables: Record<string, string>;
  description?: string;
}

@Injectable()
export class FormulasService {
  constructor(private prisma: PrismaService) {}

  async upsert(dto: UpsertFormulaDto) {
    // Validate expression with mock values
    this.validateExpression(dto.expression, dto.variables);

    return this.prisma.formula.upsert({
      where: { indicatorId: dto.indicatorId },
      create: dto,
      update: { expression: dto.expression, variables: dto.variables, description: dto.description },
    });
  }

  async findByIndicator(indicatorId: string) {
    const formula = await this.prisma.formula.findUnique({ where: { indicatorId } });
    if (!formula) throw new NotFoundException();
    return formula;
  }

  async delete(indicatorId: string) {
    return this.prisma.formula.delete({ where: { indicatorId } });
  }

  async validate(expression: string, variables: Record<string, string>) {
    try {
      this.validateExpression(expression, variables);
      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }

  private validateExpression(expression: string, variables: Record<string, string>) {
    const scope: Record<string, number> = {};
    for (const varName of Object.keys(variables)) {
      scope[varName] = 1; // mock value
    }
    try {
      evaluate(expression, scope);
    } catch (e: any) {
      throw new BadRequestException(`Invalid formula: ${e.message}`);
    }
  }
}
