import { Module } from '@nestjs/common';
import { RulesEngineService } from './rules-engine.service';
import { MedicationsModule } from '../medications/medications.module';

@Module({
  imports: [MedicationsModule],
  providers: [RulesEngineService],
  exports: [RulesEngineService],
})
export class RulesEngineModule {}
