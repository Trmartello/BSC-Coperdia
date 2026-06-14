import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restringe um endpoint aos perfis informados.
 * Ex.: @Roles('ADMIN', 'CONTROLADORIA')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
