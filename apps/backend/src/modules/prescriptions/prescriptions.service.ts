import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RulesEngineService, PatientContext, ClinicalContext } from '../rules-engine/rules-engine.service';
import { SafetyEngineService } from '../safety-engine/safety-engine.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrescriptionStatus, AuditAction } from '@prisma/client';

export interface CreatePrescriptionDto {
  patientId: string;
  diagnosis: string;
  diagnosisCode?: string;
  indication?: string;
  medications: Array<{
    medicationId: string;
    dose: string;
    frequency: string;
    route: string;
    duration?: string;
    instructions?: string;
    prn?: boolean;
  }>;
  startDate?: Date;
  endDate?: Date;
  notes?: string;
}

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private rulesEngine: RulesEngineService,
    private safetyEngine: SafetyEngineService,
    private auditService: AuditService,
  ) {}

  /**
   * Get clinical decision support recommendations
   */
  async getRecommendations(patientId: string, diagnosis: string, diagnosisCode?: string) {
    // Get patient context
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        allergies: true,
        conditions: true,
        prescriptions: {
          where: { status: PrescriptionStatus.ACTIVE },
          include: {
            items: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // Build patient context
    const patientContext: PatientContext = {
      id: patient.id,
      age: this.calculateAge(patient.dateOfBirth),
      weight: patient.weight || undefined,
      bsa: patient.bsa || undefined,
      gender: patient.gender,
      isPregnant: patient.isPregnant,
      isLactating: patient.isLactating,
      renalFunction: patient.renalFunction || undefined,
      hepaticFunction: patient.hepaticFunction || undefined,
      allergies: patient.allergies.map((a) => ({
        allergen: a.allergen,
        severity: a.severity,
      })),
      conditions: patient.conditions.map((c) => ({
        diagnosisCode: c.diagnosisCode,
        diagnosisName: c.diagnosisName,
      })),
      currentMedications: patient.prescriptions
        .flatMap((p) => p.items)
        .map((item) => ({
          medicationId: item.medication.id,
          genericName: item.medication.genericName,
        })),
    };

    // Build clinical context
    const clinicalContext: ClinicalContext = {
      diagnosis,
      diagnosisCode,
    };

    // Get recommendations from rules engine
    const recommendations = await this.rulesEngine.getRecommendations(
      patientContext,
      clinicalContext,
    );

    // Run safety checks on primary recommendation
    const safetyCheck = await this.safetyEngine.performSafetyCheck(patientContext, [
      { medicationId: recommendations.primary.medication.id, dose: recommendations.primary.dose },
    ]);

    return {
      ...recommendations,
      safetyCheck,
    };
  }

  /**
   * Create a new prescription with full safety checks
   */
  async create(data: CreatePrescriptionDto, prescriberId: string) {
    // Get patient context for safety checks
    const patient = await this.prisma.patient.findUnique({
      where: { id: data.patientId },
      include: {
        allergies: true,
        conditions: true,
        prescriptions: {
          where: { status: PrescriptionStatus.ACTIVE },
          include: {
            items: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    const patientContext: PatientContext = {
      id: patient.id,
      age: this.calculateAge(patient.dateOfBirth),
      weight: patient.weight || undefined,
      bsa: patient.bsa || undefined,
      gender: patient.gender,
      isPregnant: patient.isPregnant,
      isLactating: patient.isLactating,
      renalFunction: patient.renalFunction || undefined,
      hepaticFunction: patient.hepaticFunction || undefined,
      allergies: patient.allergies.map((a) => ({
        allergen: a.allergen,
        severity: a.severity,
      })),
      conditions: patient.conditions.map((c) => ({
        diagnosisCode: c.diagnosisCode,
        diagnosisName: c.diagnosisName,
      })),
      currentMedications: patient.prescriptions
        .flatMap((p) => p.items)
        .map((item) => ({
          medicationId: item.medication.id,
          genericName: item.medication.genericName,
        })),
    };

    // Perform safety checks
    const safetyCheck = await this.safetyEngine.performSafetyCheck(
      patientContext,
      data.medications.map((m) => ({ medicationId: m.medicationId, dose: m.dose })),
    );

    // If there are critical alerts that cannot be overridden, block the prescription
    if (safetyCheck.requiresOverride) {
      const criticalBlocking = safetyCheck.criticalAlerts.filter((a) => !a.canOverride);
      if (criticalBlocking.length > 0) {
        throw new Error(
          `Cannot create prescription: ${criticalBlocking.map((a) => a.message).join('; ')}`,
        );
      }
    }

    // Create prescription
    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: data.patientId,
        prescriberId,
        diagnosis: data.diagnosis,
        diagnosisCode: data.diagnosisCode,
        indication: data.indication,
        status: PrescriptionStatus.ACTIVE,
        startDate: data.startDate,
        endDate: data.endDate,
        notes: data.notes,
        items: {
          create: data.medications.map((med) => ({
            medicationId: med.medicationId,
            dose: med.dose,
            frequency: med.frequency,
            route: med.route,
            duration: med.duration,
            instructions: med.instructions,
            prn: med.prn || false,
          })),
        },
      },
      include: {
        items: {
          include: {
            medication: true,
          },
        },
        patient: true,
      },
    });

    // Save safety alerts
    await this.safetyEngine.saveAlertsForPrescription(prescription.id, safetyCheck.alerts);

    // Create audit log
    await this.auditService.log({
      userId: prescriberId,
      action: AuditAction.PRESCRIPTION_CREATE,
      resourceType: 'Prescription',
      resourceId: prescription.id,
      details: {
        patientId: data.patientId,
        medications: data.medications.map((m) => m.medicationId),
        alertsTriggered: safetyCheck.alerts.length,
      },
    });

    return {
      prescription,
      alerts: safetyCheck.alerts,
    };
  }

  /**
   * Get a prescription by ID
   */
  async findOne(id: string) {
    return this.prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            allergies: true,
          },
        },
        prescriber: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            licenseNumber: true,
          },
        },
        items: {
          include: {
            medication: true,
          },
        },
        alerts: true,
        dispensings: true,
      },
    });
  }

  /**
   * Get all prescriptions for a patient
   */
  async findByPatient(patientId: string, status?: PrescriptionStatus) {
    return this.prisma.prescription.findMany({
      where: {
        patientId,
        ...(status && { status }),
      },
      include: {
        prescriber: {
          select: {
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        items: {
          include: {
            medication: true,
          },
        },
        alerts: true,
      },
      orderBy: {
        prescribedAt: 'desc',
      },
    });
  }

  /**
   * Update prescription status
   */
  async updateStatus(id: string, status: PrescriptionStatus, userId: string) {
    const prescription = await this.prisma.prescription.update({
      where: { id },
      data: { status },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.PRESCRIPTION_UPDATE,
      resourceType: 'Prescription',
      resourceId: id,
      details: { newStatus: status },
    });

    return prescription;
  }

  /**
   * Override an alert (with justification)
   */
  async overrideAlert(alertId: string, reason: string, userId: string) {
    const alert = await this.prisma.prescriptionAlert.update({
      where: { id: alertId },
      data: {
        isOverridden: true,
        overrideReason: reason,
        overriddenAt: new Date(),
        overriddenBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.ALERT_OVERRIDE,
      resourceType: 'PrescriptionAlert',
      resourceId: alertId,
      details: {
        alertType: alert.type,
        alertSeverity: alert.severity,
        reason,
      },
    });

    return alert;
  }

  /**
   * Generate prescription document (for printing)
   */
  async generatePrescriptionDocument(id: string): Promise<string> {
    const prescription = await this.findOne(id);

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    // Format prescription in Bosnian format (Rp./S:)
    let document = '='.repeat(60) + '\n';
    document += 'HORALIX - Recept / Prescription\n';
    document += '='.repeat(60) + '\n\n';

    // Patient info
    document += `Pacijent / Patient: ${prescription.patient.firstName} ${prescription.patient.lastName}\n`;
    document += `Datum rođenja / DOB: ${this.formatDate(prescription.patient.dateOfBirth)}\n`;
    document += `Dijagnoza / Diagnosis: ${prescription.diagnosis}`;
    if (prescription.diagnosisCode) {
      document += ` (${prescription.diagnosisCode})`;
    }
    document += '\n\n';

    // Prescriber info
    document += `Propisao / Prescribed by: Dr. ${prescription.prescriber.firstName} ${prescription.prescriber.lastName}\n`;
    if (prescription.prescriber.licenseNumber) {
      document += `Licenca / License: ${prescription.prescriber.licenseNumber}\n`;
    }
    document += `Datum / Date: ${this.formatDate(prescription.prescribedAt)}\n\n`;

    document += '-'.repeat(60) + '\n\n';

    // Medications
    for (let i = 0; i < prescription.items.length; i++) {
      const item = prescription.items[i];
      document += `${i + 1}. Rp./\n`;
      document += `   ${item.medication.genericName}`;
      if (item.medication.brandName) {
        document += ` (${item.medication.brandName})`;
      }
      document += '\n';
      document += `   ${item.medication.dosageForm} ${item.medication.strength}\n`;
      document += `   \n`;
      document += `   S: ${item.dose} ${item.frequency}`;
      if (item.route && item.route !== 'oral') {
        document += ` (${item.route})`;
      }
      if (item.duration) {
        document += ` x ${item.duration}`;
      }
      if (item.prn) {
        document += ' (po potrebi / as needed)';
      }
      document += '\n';

      if (item.instructions) {
        document += `   Uputstva / Instructions: ${item.instructions}\n`;
      }
      document += '\n';
    }

    document += '-'.repeat(60) + '\n';

    if (prescription.notes) {
      document += `\nNapomene / Notes:\n${prescription.notes}\n\n`;
    }

    document += '\n' + '='.repeat(60) + '\n';

    return document;
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-GB');
  }
}
