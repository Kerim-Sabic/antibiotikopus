import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

// Common modules
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { LoggerModule } from './common/logger/logger.module';
import { AuditModule } from './common/audit/audit.module';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { MedicationsModule } from './modules/medications/medications.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { RulesEngineModule } from './modules/rules-engine/rules-engine.module';
import { SafetyEngineModule } from './modules/safety-engine/safety-engine.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';
import { NursingModule } from './modules/nursing/nursing.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // Common
    PrismaModule,
    RedisModule,
    LoggerModule,
    AuditModule,

    // Features
    AuthModule,
    UsersModule,
    PatientsModule,
    MedicationsModule,
    PrescriptionsModule,
    RulesEngineModule,
    SafetyEngineModule,
    PharmacyModule,
    NursingModule,
    AnalyticsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
