import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      // Marcador de build — permite confirmar qual versão da API está no ar.
      build: 'action-filters-server-side-2026-06-18',
      startedAt: new Date().toISOString(),
    };
  }
}
