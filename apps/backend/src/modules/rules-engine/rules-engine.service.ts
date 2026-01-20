import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AWaReCategory, Medication } from '@prisma/client';

export interface PatientContext {
  id: string;
  age: number;
  weight?: number;
  bsa?: number;
  gender: string;
  isPregnant?: boolean;
  isLactating?: boolean;
  renalFunction?: number; // eGFR
  hepaticFunction?: string;
  allergies?: Array<{ allergen: string; severity: string }>;
  conditions?: Array<{ diagnosisCode: string; diagnosisName: string }>;
  currentMedications?: Array<{ medicationId: string; genericName: string }>;
}

export interface ClinicalContext {
  diagnosis: string;
  diagnosisCode?: string; // ICD-10
  severity?: string;
  location?: 'community' | 'hospital';
  cultureResults?: {
    organism?: string;
    sensitivities?: string[];
    resistances?: string[];
  };
}

export interface DrugRecommendation {
  medication: Medication;
  dose: string;
  frequency: string;
  route: string;
  duration: string;
  rationale: string;
  isFirstLine: boolean;
  alternativeReason?: string;
  confidence: number; // 0-100
  guidelineSource?: string;
  evidenceLevel?: string;
}

export interface RecommendationResult {
  primary: DrugRecommendation;
  alternatives: DrugRecommendation[];
  rulesApplied: string[];
  warnings: string[];
}

@Injectable()
export class RulesEngineService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Main entry point: Get drug recommendations based on patient and clinical context
   */
  async getRecommendations(
    patientContext: PatientContext,
    clinicalContext: ClinicalContext,
  ): Promise<RecommendationResult> {
    const rulesApplied: string[] = [];
    const warnings: string[] = [];

    // Try to find matching clinical rules
    const clinicalRules = await this.findMatchingRules(clinicalContext);

    if (clinicalRules.length === 0) {
      // No specific rules found, use general antibiotic stewardship principles
      return this.getGeneralRecommendations(patientContext, clinicalContext);
    }

    // Apply the best matching rule
    const bestRule = clinicalRules[0];
    rulesApplied.push(`Clinical Rule: ${bestRule.name}`);

    // Get medications from the rule
    const firstLineChoices = bestRule.firstLineChoice as any;
    const alternativeChoices = (bestRule.alternatives as any) || [];

    // Get primary recommendation
    const primaryMedId = firstLineChoices.drugId || firstLineChoices.medications?.[0];
    const primaryMed = await this.prisma.medication.findUnique({
      where: { id: primaryMedId },
    });

    if (!primaryMed) {
      throw new Error('Primary medication not found');
    }

    // Adjust dose based on patient factors
    const primaryDose = this.calculateDose(primaryMed, patientContext, clinicalContext);

    const primary: DrugRecommendation = {
      medication: primaryMed,
      ...primaryDose,
      rationale: this.generateRationale(primaryMed, bestRule, patientContext, clinicalContext),
      isFirstLine: true,
      confidence: 90,
      guidelineSource: bestRule.guidelineSource || 'WHO AWaRe',
      evidenceLevel: bestRule.evidenceLevel,
    };

    // Get alternatives
    const alternatives: DrugRecommendation[] = [];

    for (const alt of alternativeChoices) {
      const altMed = await this.prisma.medication.findUnique({
        where: { id: alt.drugId },
      });

      if (altMed) {
        const altDose = this.calculateDose(altMed, patientContext, clinicalContext);
        alternatives.push({
          medication: altMed,
          ...altDose,
          rationale: alt.reason || 'Alternative treatment option',
          isFirstLine: false,
          alternativeReason: alt.reason,
          confidence: 70,
          guidelineSource: bestRule.guidelineSource,
        });
      }
    }

    // Add AWaRe-based warnings
    if (primaryMed.awaRe === AWaReCategory.WATCH) {
      warnings.push(
        'This is a Watch category antibiotic. Consider Access alternatives if appropriate.',
      );
    } else if (primaryMed.awaRe === AWaReCategory.RESERVE) {
      warnings.push(
        'This is a Reserve category antibiotic. Use only when other options have failed or in critical situations.',
      );
    }

    return {
      primary,
      alternatives,
      rulesApplied,
      warnings,
    };
  }

  private async findMatchingRules(clinicalContext: ClinicalContext) {
    if (!clinicalContext.diagnosisCode) {
      return [];
    }

    return this.prisma.clinicalRule.findMany({
      where: {
        isActive: true,
        diagnosisCodes: {
          has: clinicalContext.diagnosisCode,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  private calculateDose(
    medication: Medication,
    patientContext: PatientContext,
    clinicalContext: ClinicalContext,
  ): {
    dose: string;
    frequency: string;
    route: string;
    duration: string;
  } {
    // This is a simplified version. In production, this would be much more sophisticated
    // with proper dosing tables, pediatric formulas, renal adjustments, etc.

    let dose = medication.strength;
    let frequency = 'BID'; // Twice daily
    const route = medication.route;
    let duration = '7 days';

    // Pediatric dosing (simplified)
    if (patientContext.age < 18 && patientContext.weight) {
      // Weight-based dosing for children
      // This would use actual pediatric dosing guidelines
      dose = `Based on ${patientContext.weight}kg`;
    }

    // Renal adjustment
    if (patientContext.renalFunction && patientContext.renalFunction < 50) {
      frequency = 'QD'; // Reduce frequency for renal impairment
    }

    // Severity adjustment
    if (clinicalContext.severity === 'severe') {
      frequency = medication.route === 'IV' ? 'Q6H' : 'TID';
      duration = '10-14 days';
    }

    return { dose, frequency, route, duration };
  }

  private generateRationale(
    medication: Medication,
    rule: any,
    patientContext: PatientContext,
    clinicalContext: ClinicalContext,
  ): string {
    const parts: string[] = [];

    // Antibiotic stewardship rationale
    if (medication.isAntibiotic) {
      if (medication.awaRe === AWaReCategory.ACCESS) {
        parts.push(
          `${medication.genericName} is an Access antibiotic with low resistance risk and broad availability.`,
        );
      } else if (medication.awaRe === AWaReCategory.WATCH) {
        parts.push(
          `${medication.genericName} is a Watch antibiotic. It has higher resistance potential and should be used when Access antibiotics are unsuitable.`,
        );
      }
    }

    // Efficacy
    parts.push(
      `Recommended as first-line treatment for ${clinicalContext.diagnosis} based on ${rule.guidelineSource || 'clinical guidelines'}.`,
    );

    // Patient-specific factors
    if (patientContext.renalFunction && patientContext.renalFunction < 60) {
      parts.push(`Dosing adjusted for renal function (eGFR: ${patientContext.renalFunction}).`);
    }

    if (patientContext.age < 18) {
      parts.push('Pediatric dosing applied based on weight and age.');
    }

    if (patientContext.isPregnant) {
      parts.push('Considered safe for use in pregnancy (Category B).');
    }

    return parts.join(' ');
  }

  /**
   * Fallback when no specific rules are found
   */
  private async getGeneralRecommendations(
    patientContext: PatientContext,
    clinicalContext: ClinicalContext,
  ): Promise<RecommendationResult> {
    // Return general antibiotic stewardship recommendations
    // Prefer Access antibiotics

    const accessAntibiotics = await this.prisma.medication.findMany({
      where: {
        isAntibiotic: true,
        awaRe: AWaReCategory.ACCESS,
        isActive: true,
      },
      take: 5,
    });

    if (accessAntibiotics.length === 0) {
      throw new Error('No suitable medications found');
    }

    const primaryMed = accessAntibiotics[0];
    const primaryDose = this.calculateDose(primaryMed, patientContext, clinicalContext);

    const primary: DrugRecommendation = {
      medication: primaryMed,
      ...primaryDose,
      rationale: `${primaryMed.genericName} is an Access antibiotic suitable for empiric therapy. Consider adjusting based on culture results.`,
      isFirstLine: true,
      confidence: 60,
      guidelineSource: 'WHO AWaRe Classification',
    };

    const alternatives = accessAntibiotics.slice(1, 3).map((med) => ({
      medication: med,
      ...this.calculateDose(med, patientContext, clinicalContext),
      rationale: 'Alternative Access antibiotic option',
      isFirstLine: false,
      confidence: 50,
    }));

    return {
      primary,
      alternatives,
      rulesApplied: ['General antibiotic stewardship principles'],
      warnings: [
        'No specific clinical rule found. Recommendation based on general principles. Consider consulting infectious disease specialist.',
      ],
    };
  }

  /**
   * Create or update a clinical rule
   */
  async createRule(data: {
    name: string;
    description: string;
    diagnosisCodes: string[];
    firstLineChoice: any;
    alternatives?: any;
    awaRePreference?: AWaReCategory;
    guidelineSource?: string;
    evidenceLevel?: string;
  }) {
    return this.prisma.clinicalRule.create({
      data: {
        name: data.name,
        description: data.description,
        diagnosisCodes: data.diagnosisCodes,
        firstLineChoice: data.firstLineChoice as any,
        alternatives: data.alternatives as any,
        awaRePreference: data.awaRePreference,
        guidelineSource: data.guidelineSource,
        evidenceLevel: data.evidenceLevel,
      },
    });
  }

  /**
   * Get all active rules
   */
  async getAllRules() {
    return this.prisma.clinicalRule.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Deactivate a rule
   */
  async deactivateRule(id: string) {
    return this.prisma.clinicalRule.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
