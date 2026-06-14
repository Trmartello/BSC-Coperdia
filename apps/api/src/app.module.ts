import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { IndicatorsModule } from './modules/indicators/indicators.module';
import { FormulasModule } from './modules/formulas/formulas.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';
import { CalcEngineModule } from './modules/calc-engine/calc-engine.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ActionPlansModule } from './modules/action-plans/action-plans.module';
import { MapsModule } from './modules/maps/maps.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'apps/api/.env'] }),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 20 }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'uploads'), serveRoot: '/uploads' }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    IndicatorsModule,
    FormulasModule,
    ScenariosModule,
    CalcEngineModule,
    DashboardModule,
    ActionPlansModule,
    MapsModule,
    SettingsModule,
  ],
})
export class AppModule {}
