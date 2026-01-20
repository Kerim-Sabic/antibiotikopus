import { Module } from '@nestjs/common';
import { SafetyEngineService } from './safety-engine.service';

@Module({
  providers: [SafetyEngineService],
  exports: [SafetyEngineService],
})
export class SafetyEngineModule {}
