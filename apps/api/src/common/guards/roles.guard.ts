import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Garante que o usuário autenticado possua um dos perfis exigidos pelo @Roles.
 * Deve ser usado APÓS o JwtAuthGuard (que popula req.user).
 * Sem @Roles no handler/classe, libera o acesso (apenas autenticação).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação.');
    }
    return true;
  }
}
