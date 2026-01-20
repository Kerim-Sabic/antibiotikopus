import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AlertType, AlertSeverity, Medication } from '@prisma/client';
import { PatientContext } from '../rules-engine/rules-engine.service';

export interface SafetyAlert {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  clinicalRationale?: string;
  recommendation?: string;
  canOverride: boolean;
}

export interface SafetyCheckResult {
  safe: boolean;
  alerts: SafetyAlert[];
  criticalAlerts: SafetyAlert[];
  requiresOverride: boolean;
}

@Injectable()
export class SafetyEngineService {
  constructor(private prisma: PrismaService) {}

  /**
   * Main safety check function
   * Performs all safety validations before a prescription is created/updated
   */
  async performSafetyCheck(
    patientContext: PatientContext,
    proposedMedications: Array<{ medicationId: string; dose: string }>,
  ): Promise<SafetyCheckResult> {
    const alerts: SafetyAlert[] = [];

    // Get full medication details
    const medications = await Promise.all(
      proposedMedications.map((pm) =>
        this.prisma.medication.findUnique({ where: { id: pm.medicationId } }),
      ),
    );

    // 1. Allergy checks
    const allergyAlerts = await this.checkAllergies(patientContext, medications);
    alerts.push(...allergyAlerts);

    // 2. Drug-drug interactions
    const interactionAlerts = await this.checkDrugInteractions(
      medications,
      patientContext.currentMedications || [],
    );
    alerts.push(...interactionAlerts);

    // 3. Contraindications
    const contraindicationAlerts = this.checkContraindications(patientContext, medications);
    alerts.push(...contraindicationAlerts);

    // 4. Duplicate therapy
    const duplicateAlerts = this.checkDuplicateTherapy(
      medications,
      patientContext.currentMedications || [],
    );
    alerts.push(...duplicateAlerts);

    // 5. Dose range validation
    const doseAlerts = this.checkDoseRanges(patientContext, proposedMedications, medications);
    alerts.push(...doseAlerts);

    // 6. Organ function checks
    const organFunctionAlerts = this.checkOrganFunction(patientContext, medications);
    alerts.push(...organFunctionAlerts);

    // 7. Pregnancy/Lactation warnings
    const pregnancyAlerts = this.checkPregnancyLactation(patientContext, medications);
    alerts.push(...pregnancyAlerts);

    // 8. Age-specific warnings
    const ageAlerts = this.checkAgeSpecific(patientContext, medications);
    alerts.push(...ageAlerts);

    // Determine if critical alerts prevent prescription
    const criticalAlerts = alerts.filter((a) => a.severity === AlertSeverity.CRITICAL);
    const requiresOverride = criticalAlerts.some((a) => !a.canOverride);

    return {
      safe: criticalAlerts.length === 0,
      alerts,
      criticalAlerts,
      requiresOverride,
    };
  }

  /**
   * 1. Allergy checks
   */
  private async checkAllergies(
    patientContext: PatientContext,
    medications: Medication[],
  ): Promise<SafetyAlert[]> {
    const alerts: SafetyAlert[] = [];

    if (!patientContext.allergies || patientContext.allergies.length === 0) {
      return alerts;
    }

    for (const med of medications) {
      if (!med) continue;

      for (const allergy of patientContext.allergies) {
        // Direct match
        if (
          med.genericName.toLowerCase().includes(allergy.allergen.toLowerCase()) ||
          allergy.allergen.toLowerCase().includes(med.genericName.toLowerCase())
        ) {
          alerts.push({
            type: AlertType.ALLERGY,
            severity:
              allergy.severity === 'LIFE_THREATENING' || allergy.severity === 'SEVERE'
                ? AlertSeverity.CRITICAL
                : AlertSeverity.WARNING,
            message: `Patient has documented ${allergy.severity.toLowerCase()} allergy to ${allergy.allergen}`,
            clinicalRationale: `Reaction: ${allergy.allergen}. This medication contains or is related to the allergen.`,
            recommendation: `Avoid ${med.genericName}. Consider alternative medication class.`,
            canOverride: allergy.severity !== 'LIFE_THREATENING',
          });
        }

        // Cross-sensitivity checks (simplified - would be more comprehensive in production)
        if (this.checkCrossSensitivity(allergy.allergen, med.genericName)) {
          alerts.push({
            type: AlertType.ALLERGY,
            severity: AlertSeverity.WARNING,
            message: `Possible cross-sensitivity: Patient allergic to ${allergy.allergen}`,
            clinicalRationale: `${med.genericName} may have cross-sensitivity with ${allergy.allergen}`,
            recommendation: 'Monitor closely or consider alternative.',
            canOverride: true,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Check for cross-sensitivity (simplified version)
   */
  private checkCrossSensitivity(allergen: string, drugName: string): boolean {
    const crossSensitivities: Record<string, string[]> = {
      penicillin: ['amoxicillin', 'ampicillin', 'cephalosporin', 'ceftriaxone'],
      sulfa: ['sulfamethoxazole', 'trimethoprim'],
      aspirin: ['ibuprofen', 'naproxen', 'diclofenac'],
    };

    for (const [key, related] of Object.entries(crossSensitivities)) {
      if (
        allergen.toLowerCase().includes(key) &&
        related.some((r) => drugName.toLowerCase().includes(r))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 2. Drug-drug interactions
   */
  private async checkDrugInteractions(
    proposedMeds: Medication[],
    currentMeds: Array<{ medicationId: string; genericName: string }>,
  ): Promise<SafetyAlert[]> {
    const alerts: SafetyAlert[] = [];

    // Check interactions between proposed medications
    for (let i = 0; i < proposedMeds.length; i++) {
      for (let j = i + 1; j < proposedMeds.length; j++) {
        const interaction = await this.prisma.drugInteraction.findFirst({
          where: {
            OR: [
              { drug1Id: proposedMeds[i]?.id, drug2Id: proposedMeds[j]?.id },
              { drug1Id: proposedMeds[j]?.id, drug2Id: proposedMeds[i]?.id },
            ],
          },
          include: {
            drug1: true,
            drug2: true,
          },
        });

        if (interaction) {
          alerts.push({
            type: AlertType.DRUG_INTERACTION,
            severity: this.mapInteractionSeverity(interaction.severity),
            message: `Interaction between ${interaction.drug1.genericName} and ${interaction.drug2.genericName}`,
            clinicalRationale: interaction.description,
            recommendation: interaction.management || 'Monitor closely',
            canOverride: interaction.severity !== 'CONTRAINDICATED',
          });
        }
      }
    }

    // Check interactions with current medications
    for (const proposedMed of proposedMeds) {
      if (!proposedMed) continue;

      for (const currentMed of currentMeds) {
        const interaction = await this.prisma.drugInteraction.findFirst({
          where: {
            OR: [
              { drug1Id: proposedMed.id, drug2Id: currentMed.medicationId },
              { drug1Id: currentMed.medicationId, drug2Id: proposedMed.id },
            ],
          },
          include: {
            drug1: true,
            drug2: true,
          },
        });

        if (interaction) {
          alerts.push({
            type: AlertType.DRUG_INTERACTION,
            severity: this.mapInteractionSeverity(interaction.severity),
            message: `Interaction with current medication: ${currentMed.genericName}`,
            clinicalRationale: interaction.description,
            recommendation: interaction.management || 'Consider alternative or adjust dosing',
            canOverride: interaction.severity !== 'CONTRAINDICATED',
          });
        }
      }
    }

    return alerts;
  }

  private mapInteractionSeverity(severity: string): AlertSeverity {
    switch (severity) {
      case 'CONTRAINDICATED':
      case 'MAJOR':
        return AlertSeverity.CRITICAL;
      case 'MODERATE':
        return AlertSeverity.WARNING;
      default:
        return AlertSeverity.INFO;
    }
  }

  /**
   * 3. Contraindications based on patient conditions
   */
  private checkContraindications(
    patientContext: PatientContext,
    medications: Medication[],
  ): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Common contraindications (simplified)
    const contraindications: Record<string, string[]> = {
      'peptic ulcer': ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac'],
      'heart failure': ['nsaid', 'ibuprofen'],
      asthma: ['aspirin', 'beta-blocker'],
      'renal failure': ['metformin', 'nsaid'],
    };

    if (!patientContext.conditions) return alerts;

    for (const condition of patientContext.conditions) {
      for (const [contraindicatedCondition, drugs] of Object.entries(contraindications)) {
        if (condition.diagnosisName.toLowerCase().includes(contraindicatedCondition)) {
          for (const med of medications) {
            if (!med) continue;

            if (drugs.some((drug) => med.genericName.toLowerCase().includes(drug))) {
              alerts.push({
                type: AlertType.CONTRAINDICATION,
                severity: AlertSeverity.CRITICAL,
                message: `${med.genericName} is contraindicated in ${condition.diagnosisName}`,
                clinicalRationale: `Patient has ${condition.diagnosisName} which is a contraindication for ${med.genericName}`,
                recommendation: 'Use alternative medication',
                canOverride: false,
              });
            }
          }
        }
      }
    }

    return alerts;
  }

  /**
   * 4. Duplicate therapy detection
   */
  private checkDuplicateTherapy(
    proposedMeds: Medication[],
    currentMeds: Array<{ medicationId: string; genericName: string }>,
  ): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Check for same drug
    for (const proposed of proposedMeds) {
      if (!proposed) continue;

      for (const current of currentMeds) {
        if (
          proposed.genericName.toLowerCase() === current.genericName.toLowerCase() ||
          proposed.id === current.medicationId
        ) {
          alerts.push({
            type: AlertType.DUPLICATE_THERAPY,
            severity: AlertSeverity.WARNING,
            message: `Duplicate medication: ${proposed.genericName} is already prescribed`,
            clinicalRationale: 'Patient is already taking this medication',
            recommendation: 'Review current medications before prescribing',
            canOverride: true,
          });
        }
      }
    }

    // Check for same therapeutic class (simplified)
    const therapeuticClasses = this.groupByTherapeuticClass([
      ...proposedMeds.filter((m) => m),
      ...currentMeds.map((m) => ({ genericName: m.genericName, therapeuticClass: null })),
    ]);

    for (const [className, drugs] of Object.entries(therapeuticClasses)) {
      if (drugs.length > 1) {
        alerts.push({
          type: AlertType.DUPLICATE_THERAPY,
          severity: AlertSeverity.WARNING,
          message: `Multiple medications from same class: ${className}`,
          clinicalRationale: `Prescribing multiple ${className} may not be appropriate`,
          recommendation: 'Review therapeutic duplication',
          canOverride: true,
        });
      }
    }

    return alerts;
  }

  private groupByTherapeuticClass(medications: any[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    for (const med of medications) {
      const className = med.therapeuticClass || 'Unknown';
      if (!groups[className]) {
        groups[className] = [];
      }
      groups[className].push(med.genericName);
    }

    return groups;
  }

  /**
   * 5. Dose range validation
   */
  private checkDoseRanges(
    patientContext: PatientContext,
    proposedMedications: Array<{ medicationId: string; dose: string }>,
    medications: Medication[],
  ): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Simplified dose checking
    // In production, this would use comprehensive dosing tables

    for (let i = 0; i < proposedMedications.length; i++) {
      const proposed = proposedMedications[i];
      const med = medications[i];

      if (!med) continue;

      // Extract numeric dose (very simplified)
      const doseMatch = proposed.dose.match(/(\d+\.?\d*)/);
      if (!doseMatch) continue;

      const doseValue = parseFloat(doseMatch[1]);

      // Pediatric dose checks
      if (patientContext.age < 18 && !patientContext.weight) {
        alerts.push({
          type: AlertType.DOSE_RANGE,
          severity: AlertSeverity.WARNING,
          message: 'Pediatric patient: weight required for dose calculation',
          clinicalRationale: 'Weight-based dosing is recommended for pediatric patients',
          recommendation: 'Enter patient weight for accurate dosing',
          canOverride: true,
        });
      }

      // Example: very high dose warning
      if (doseValue > 5000) {
        alerts.push({
          type: AlertType.DOSE_RANGE,
          severity: AlertSeverity.CRITICAL,
          message: `Dose appears unusually high: ${proposed.dose}`,
          clinicalRationale: 'Dose exceeds typical maximum',
          recommendation: 'Verify dose calculation',
          canOverride: true,
        });
      }
    }

    return alerts;
  }

  /**
   * 6. Organ function checks (renal and hepatic)
   */
  private checkOrganFunction(
    patientContext: PatientContext,
    medications: Medication[],
  ): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Renal function
    if (patientContext.renalFunction && patientContext.renalFunction < 60) {
      const renallyExcreted = ['metformin', 'gabapentin', 'enoxaparin', 'digoxin'];

      for (const med of medications) {
        if (!med) continue;

        if (renallyExcreted.some((drug) => med.genericName.toLowerCase().includes(drug))) {
          const severity =
            patientContext.renalFunction < 30 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;

          alerts.push({
            type: AlertType.RENAL_ADJUSTMENT,
            severity,
            message: `Renal dose adjustment required for ${med.genericName}`,
            clinicalRationale: `Patient eGFR: ${patientContext.renalFunction} mL/min. ${med.genericName} requires dose adjustment in renal impairment.`,
            recommendation:
              patientContext.renalFunction < 30
                ? 'Avoid or use significantly reduced dose'
                : 'Reduce dose based on renal function',
            canOverride: severity === AlertSeverity.WARNING,
          });
        }
      }
    }

    // Hepatic function
    if (
      patientContext.hepaticFunction &&
      ['Moderate', 'Severe'].includes(patientContext.hepaticFunction)
    ) {
      const hepaticMetabolized = ['warfarin', 'phenytoin', 'carbamazepine'];

      for (const med of medications) {
        if (!med) continue;

        if (hepaticMetabolized.some((drug) => med.genericName.toLowerCase().includes(drug))) {
          alerts.push({
            type: AlertType.HEPATIC_ADJUSTMENT,
            severity: AlertSeverity.WARNING,
            message: `Hepatic dose adjustment may be needed for ${med.genericName}`,
            clinicalRationale: `Patient has ${patientContext.hepaticFunction.toLowerCase()} hepatic impairment.`,
            recommendation: 'Monitor closely and adjust dose as needed',
            canOverride: true,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * 7. Pregnancy and lactation warnings
   */
  private checkPregnancyLactation(
    patientContext: PatientContext,
    medications: Medication[],
  ): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Pregnancy Category D and X drugs (contraindicated)
    const pregnancyContraindicated = ['warfarin', 'methotrexate', 'isotretinoin', 'finasteride'];
    const pregnancyCaution = ['ace inhibitor', 'arb', 'nsaid'];

    if (patientContext.isPregnant) {
      for (const med of medications) {
        if (!med) continue;

        if (
          pregnancyContraindicated.some((drug) => med.genericName.toLowerCase().includes(drug))
        ) {
          alerts.push({
            type: AlertType.PREGNANCY_WARNING,
            severity: AlertSeverity.CRITICAL,
            message: `${med.genericName} is contraindicated in pregnancy`,
            clinicalRationale: 'Known teratogenic effects or fetal harm',
            recommendation: 'Use alternative medication safe for pregnancy',
            canOverride: false,
          });
        } else if (pregnancyCaution.some((drug) => med.genericName.toLowerCase().includes(drug))) {
          alerts.push({
            type: AlertType.PREGNANCY_WARNING,
            severity: AlertSeverity.WARNING,
            message: `Use ${med.genericName} with caution in pregnancy`,
            clinicalRationale: 'Potential risks to fetus',
            recommendation: 'Consider safer alternatives or use only if benefit outweighs risk',
            canOverride: true,
          });
        }
      }
    }

    if (patientContext.isLactating) {
      const lactationCaution = ['codeine', 'aspirin', 'lithium'];

      for (const med of medications) {
        if (!med) continue;

        if (lactationCaution.some((drug) => med.genericName.toLowerCase().includes(drug))) {
          alerts.push({
            type: AlertType.LACTATION_WARNING,
            severity: AlertSeverity.WARNING,
            message: `${med.genericName} may not be safe during breastfeeding`,
            clinicalRationale: 'Drug passes into breast milk',
            recommendation: 'Consider alternative or monitor infant closely',
            canOverride: true,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * 8. Age-specific warnings
   */
  private checkAgeSpecific(patientContext: PatientContext, medications: Medication[]): SafetyAlert[] {
    const alerts: SafetyAlert[] = [];

    // Pediatric contraindications
    if (patientContext.age < 18) {
      const pediatricContraindicated = ['tetracycline', 'fluoroquinolone', 'aspirin'];

      for (const med of medications) {
        if (!med) continue;

        if (
          pediatricContraindicated.some((drug) => med.genericName.toLowerCase().includes(drug))
        ) {
          let severity = AlertSeverity.WARNING;
          let rationale = 'Generally not recommended in pediatric patients';

          if (med.genericName.toLowerCase().includes('aspirin') && patientContext.age < 12) {
            severity = AlertSeverity.CRITICAL;
            rationale = "Risk of Reye's syndrome in children";
          }

          alerts.push({
            type: AlertType.AGE_WARNING,
            severity,
            message: `${med.genericName} not recommended for age ${patientContext.age}`,
            clinicalRationale: rationale,
            recommendation: 'Use age-appropriate alternative',
            canOverride: severity === AlertSeverity.WARNING,
          });
        }
      }
    }

    // Geriatric considerations
    if (patientContext.age >= 65) {
      const geriatricCaution = ['benzodiazepine', 'anticholinergic', 'opioid'];

      for (const med of medications) {
        if (!med) continue;

        if (geriatricCaution.some((drug) => med.genericName.toLowerCase().includes(drug))) {
          alerts.push({
            type: AlertType.AGE_WARNING,
            severity: AlertSeverity.INFO,
            message: `Use ${med.genericName} with caution in elderly patients`,
            clinicalRationale: 'Increased risk of falls, cognitive impairment, or adverse effects',
            recommendation: 'Start with low dose and monitor closely',
            canOverride: true,
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Store alerts in database for a prescription
   */
  async saveAlertsForPrescription(prescriptionId: string, alerts: SafetyAlert[]) {
    const alertRecords = alerts.map((alert) => ({
      prescriptionId,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      clinicalRationale: alert.clinicalRationale,
      recommendation: alert.recommendation,
    }));

    await this.prisma.prescriptionAlert.createMany({
      data: alertRecords,
    });
  }
}
