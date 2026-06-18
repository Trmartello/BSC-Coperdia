import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
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
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'apps/api/.env'] }),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 20 }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'uploads'), serveRoot: '/uploads' }),
    ScheduleModule.forRoot(),
    MailerModule.forRootAsync({
      useFactory: () => ({
        transport: {
          host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT ?? '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        },
        defaults: {
          from: process.env.SMTP_FROM ?? `"BSC Copérdia" <${process.env.SMTP_USER}>`,
        },
        template: {
          dir: join(__dirname, 'modules', 'notifications', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
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
    NotificationsModule,
  ],
})
export class AppModule {}
