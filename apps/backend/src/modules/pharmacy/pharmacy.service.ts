import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SafetyEngineService } from '../safety-engine/safety-engine.service';
import { DispensingStatus, AuditAction, NotificationType } from '@prisma/client';

export interface PrescriptionQueueItem {
  id: string;
  prescriptionId: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    nationalId: string;
  };
  prescriber: {
    firstName: string;
    lastName: string;
    licenseNumber?: string;
  };
  medications: Array<{
    id: string;
    name: string;
    dose: string;
    frequency: string;
    quantity: string;
  }>;
  prescribedAt: Date;
  status: DispensingStatus;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
}

export interface SubstitutionSuggestion {
  original: any;
  alternatives: Array<{
    medication: any;
    reason: string;
    costDifference?: number;
    inStock: boolean;
  }>;
}

@Injectable()
export class PharmacyService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private safetyEngine: SafetyEngineService,
  ) {}

  /**
   * Get pharmacy dispensing queue
   */
  async getDispensingQueue(
    pharmacistId: string,
    filters?: {
      status?: DispensingStatus;
      ward?: string;
      priority?: string;
    },
  ): Promise<PrescriptionQueueItem[]> {
    const dispensings = await this.prisma.dispensing.findMany({
      where: {
        status: filters?.status || { in: ['PENDING', 'IN_PROGRESS'] },
        prescription: {
          status: 'ACTIVE',
        },
      },
      include: {
        prescription: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nationalId: true,
              },
            },
            prescriber: {
              select: {
                firstName: true,
                lastName: true,
                licenseNumber: true,
              },
            },
            items: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
      orderBy: [
        { createdAt: 'asc' }, // FIFO
      ],
    });

    return dispensings.map((d) => ({
      id: d.id,
      prescriptionId: d.prescriptionId,
      patient: {
        id: d.prescription.patient.id,
        firstName: d.prescription.patient.firstName,
        lastName: d.prescription.patient.lastName,
        nationalId: d.prescription.patient.nationalId,
      },
      prescriber: {
        firstName: d.prescription.prescriber.firstName,
        lastName: d.prescription.prescriber.lastName,
        licenseNumber: d.prescription.prescriber.licenseNumber || undefined,
      },
      medications: d.prescription.items.map((item) => ({
        id: item.id,
        name: item.medication.genericName,
        dose: item.dose,
        frequency: item.frequency,
        quantity: this.calculateQuantity(item.frequency, item.duration),
      })),
      prescribedAt: d.prescription.prescribedAt,
      status: d.status,
      priority: this.determinePriority(d.prescription),
    }));
  }

  /**
   * Start dispensing a prescription
   */
  async startDispensing(dispensingId: string, pharmacistId: string) {
    const dispensing = await this.prisma.dispensing.findUnique({
      where: { id: dispensingId },
      include: {
        prescription: {
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

    if (!dispensing) {
      throw new NotFoundException('Dispensing record not found');
    }

    if (dispensing.status !== DispensingStatus.PENDING) {
      throw new BadRequestException(
        `Cannot start dispensing. Current status: ${dispensing.status}`,
      );
    }

    const updated = await this.prisma.dispensing.update({
      where: { id: dispensingId },
      data: {
        status: DispensingStatus.IN_PROGRESS,
        pharmacistId,
      },
    });

    await this.auditService.log({
      userId: pharmacistId,
      action: AuditAction.PRESCRIPTION_UPDATE,
      resourceType: 'Dispensing',
      resourceId: dispensingId,
      details: {
        status: 'IN_PROGRESS',
        prescriptionId: dispensing.prescriptionId,
      },
    });

    return updated;
  }

  /**
   * Complete dispensing (mark as dispensed)
   */
  async completeDispensing(
    dispensingId: string,
    pharmacistId: string,
    data: {
      substitutionMade?: boolean;
      substitutionNotes?: string;
      notes?: string;
    },
  ) {
    const dispensing = await this.prisma.dispensing.findUnique({
      where: { id: dispensingId },
      include: {
        prescription: {
          include: {
            patient: true,
            prescriber: true,
            items: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
    });

    if (!dispensing) {
      throw new NotFoundException('Dispensing record not found');
    }

    if (dispensing.status === DispensingStatus.DISPENSED) {
      throw new BadRequestException('This prescription has already been dispensed');
    }

    // If substitution was made, re-run safety checks
    if (data.substitutionMade && data.substitutionNotes) {
      const patientContext = {
        id: dispensing.prescription.patient.id,
        age: this.calculateAge(dispensing.prescription.patient.dateOfBirth),
        weight: dispensing.prescription.patient.weight || undefined,
        gender: dispensing.prescription.patient.gender,
        isPregnant: dispensing.prescription.patient.isPregnant,
        isLactating: dispensing.prescription.patient.isLactating,
        renalFunction: dispensing.prescription.patient.renalFunction || undefined,
        hepaticFunction: dispensing.prescription.patient.hepaticFunction || undefined,
        allergies: [],
        conditions: [],
        currentMedications: [],
      };

      // Simplified re-check (in production, would be more thorough)
      const safetyCheck = await this.safetyEngine.performSafetyCheck(
        patientContext,
        dispensing.prescription.items.map((item) => ({
          medicationId: item.medicationId,
          dose: item.dose,
        })),
      );

      if (safetyCheck.requiresOverride) {
        throw new BadRequestException(
          'Substitution creates safety concerns. Please consult with prescriber.',
        );
      }
    }

    const updated = await this.prisma.dispensing.update({
      where: { id: dispensingId },
      data: {
        status: DispensingStatus.DISPENSED,
        pharmacistId,
        dispensedAt: new Date(),
        substitutionMade: data.substitutionMade || false,
        substitutionNotes: data.substitutionNotes,
        notes: data.notes,
      },
    });

    await this.auditService.log({
      userId: pharmacistId,
      action: AuditAction.MEDICATION_DISPENSE,
      resourceType: 'Dispensing',
      resourceId: dispensingId,
      details: {
        prescriptionId: dispensing.prescriptionId,
        substitutionMade: data.substitutionMade,
        substitutionNotes: data.substitutionNotes,
      },
    });

    // Notify nursing staff that medication is ready
    const nurses = await this.prisma.user.findMany({
      where: {
        role: 'NURSE',
        isActive: true,
      },
      select: { id: true },
    });

    await Promise.all(
      nurses.map((nurse) =>
        this.prisma.notification.create({
          data: {
            userId: nurse.id,
            type: NotificationType.PRESCRIPTION_READY,
            title: 'Prescription Ready',
            message: `Prescription for ${dispensing.prescription.patient.firstName} ${dispensing.prescription.patient.lastName} is ready for pickup`,
            relatedResourceType: 'Dispensing',
            relatedResourceId: dispensingId,
          },
        }),
      ),
    );

    return updated;
  }

  /**
   * Mark prescription as out of stock
   */
  async markOutOfStock(
    dispensingId: string,
    pharmacistId: string,
    notes: string,
  ) {
    const updated = await this.prisma.dispensing.update({
      where: { id: dispensingId },
      data: {
        status: DispensingStatus.OUT_OF_STOCK,
        pharmacistId,
        notes,
      },
    });

    // Notify prescriber
    const dispensing = await this.prisma.dispensing.findUnique({
      where: { id: dispensingId },
      include: {
        prescription: {
          include: {
            patient: true,
            items: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: dispensing!.prescription.prescriberId,
        type: NotificationType.CRITICAL_ALERT,
        title: 'Medication Out of Stock',
        message: `${dispensing!.prescription.items[0].medication.genericName} is out of stock. Please select alternative.`,
        relatedResourceType: 'Dispensing',
        relatedResourceId: dispensingId,
      },
    });

    await this.auditService.log({
      userId: pharmacistId,
      action: AuditAction.MEDICATION_DISPENSE,
      resourceType: 'Dispensing',
      resourceId: dispensingId,
      details: {
        status: 'OUT_OF_STOCK',
        notes,
      },
    });

    return updated;
  }

  /**
   * Get substitution suggestions for a medication
   */
  async getSubstitutionSuggestions(medicationId: string): Promise<SubstitutionSuggestion> {
    const original = await this.prisma.medication.findUnique({
      where: { id: medicationId },
    });

    if (!original) {
      throw new NotFoundException('Medication not found');
    }

    // Find alternatives with same generic name or ATC code
    const alternatives = await this.prisma.medication.findMany({
      where: {
        OR: [
          { genericName: original.genericName, id: { not: medicationId } },
          {
            atcCode: original.atcCode,
            id: { not: medicationId },
            awaRe: original.awaRe, // Prefer same AWaRe category
          },
        ],
        isActive: true,
      },
      take: 10,
      orderBy: [
        { awaRe: 'asc' }, // Prefer Access over Watch over Reserve
        { genericName: 'asc' },
      ],
    });

    return {
      original,
      alternatives: alternatives.map((alt) => {
        let reason = '';

        if (alt.genericName === original.genericName) {
          if (alt.manufacturer !== original.manufacturer) {
            reason = `Same drug, different manufacturer (${alt.manufacturer})`;
          } else if (alt.strength !== original.strength) {
            reason = `Same drug, different strength (${alt.strength})`;
          } else {
            reason = 'Therapeutic equivalent';
          }
        } else if (alt.atcCode === original.atcCode) {
          reason = `Same therapeutic class (ATC: ${alt.atcCode})`;
        }

        return {
          medication: alt,
          reason,
          inStock: true, // Would integrate with inventory system
        };
      }),
    };
  }

  /**
   * Validate substitution before dispensing
   */
  async validateSubstitution(
    originalMedicationId: string,
    substituteMedicationId: string,
    patientId: string,
  ): Promise<{
    valid: boolean;
    warnings: string[];
    requiresPrescriberApproval: boolean;
  }> {
    const [original, substitute] = await Promise.all([
      this.prisma.medication.findUnique({ where: { id: originalMedicationId } }),
      this.prisma.medication.findUnique({ where: { id: substituteMedicationId } }),
    ]);

    if (!original || !substitute) {
      throw new NotFoundException('Medication not found');
    }

    const warnings: string[] = [];
    let requiresPrescriberApproval = false;

    // Check if same generic
    if (original.genericName !== substitute.genericName) {
      warnings.push(
        'Different active ingredient. Therapeutic substitution requires prescriber approval.',
      );
      requiresPrescriberApproval = true;
    }

    // Check if same strength
    if (original.strength !== substitute.strength) {
      warnings.push(
        `Different strength: ${original.strength} → ${substitute.strength}. Verify dosing.`,
      );
      requiresPrescriberApproval = true;
    }

    // Check if same route
    if (original.route !== substitute.route) {
      warnings.push(
        `Different route: ${original.route} → ${substitute.route}. Requires prescriber approval.`,
      );
      requiresPrescriberApproval = true;
    }

    // Check if same dosage form
    if (original.dosageForm !== substitute.dosageForm) {
      warnings.push(
        `Different form: ${original.dosageForm} → ${substitute.dosageForm}. Patient may need counseling.`,
      );
    }

    // Check AWaRe category change
    if (original.isAntibiotic && substitute.isAntibiotic) {
      if (original.awaRe !== substitute.awaRe) {
        warnings.push(
          `AWaRe category change: ${original.awaRe} → ${substitute.awaRe}. May impact stewardship metrics.`,
        );
        if (
          original.awaRe === 'ACCESS' &&
          (substitute.awaRe === 'WATCH' || substitute.awaRe === 'RESERVE')
        ) {
          requiresPrescriberApproval = true;
        }
      }
    }

    // If just brand/manufacturer change with same generic and strength, no approval needed
    const valid =
      original.genericName === substitute.genericName &&
      original.strength === substitute.strength &&
      original.route === substitute.route;

    return {
      valid,
      warnings,
      requiresPrescriberApproval: !valid || requiresPrescriberApproval,
    };
  }

  /**
   * Get dispensing statistics for pharmacy dashboard
   */
  async getPharmacyStatistics(startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const [
      totalDispensed,
      totalPending,
      totalOutOfStock,
      substitutionsMade,
      averageDispenseTime,
    ] = await Promise.all([
      this.prisma.dispensing.count({
        where: {
          status: DispensingStatus.DISPENSED,
          dispensedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.dispensing.count({
        where: {
          status: { in: [DispensingStatus.PENDING, DispensingStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.dispensing.count({
        where: {
          status: DispensingStatus.OUT_OF_STOCK,
          updatedAt: { gte: start, lte: end },
        },
      }),
      this.prisma.dispensing.count({
        where: {
          substitutionMade: true,
          dispensedAt: { gte: start, lte: end },
        },
      }),
      this.calculateAverageDispenseTime(start, end),
    ]);

    return {
      period: { start, end },
      totalDispensed,
      totalPending,
      totalOutOfStock,
      substitutionsMade,
      substitutionRate: totalDispensed > 0 ? (substitutionsMade / totalDispensed) * 100 : 0,
      averageDispenseTime: Math.round(averageDispenseTime), // minutes
    };
  }

  /**
   * Calculate average time from prescription to dispensing
   */
  private async calculateAverageDispenseTime(
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const dispensings = await this.prisma.dispensing.findMany({
      where: {
        status: DispensingStatus.DISPENSED,
        dispensedAt: { gte: startDate, lte: endDate },
      },
      include: {
        prescription: {
          select: {
            prescribedAt: true,
          },
        },
      },
    });

    if (dispensings.length === 0) return 0;

    const totalMinutes = dispensings.reduce((sum, d) => {
      if (!d.dispensedAt) return sum;
      const diff = d.dispensedAt.getTime() - d.prescription.prescribedAt.getTime();
      return sum + diff / (1000 * 60); // Convert to minutes
    }, 0);

    return totalMinutes / dispensings.length;
  }

  /**
   * Calculate quantity needed based on frequency and duration
   */
  private calculateQuantity(frequency: string, duration?: string): string {
    if (!duration) return 'N/A';

    const daysMatch = duration.match(/(\d+)\s*days?/i);
    if (!daysMatch) return 'N/A';

    const days = parseInt(daysMatch[1]);
    let timesPerDay = 1;

    const freq = frequency.toUpperCase();
    if (freq === 'BID') timesPerDay = 2;
    else if (freq === 'TID') timesPerDay = 3;
    else if (freq === 'QID') timesPerDay = 4;
    else if (freq.startsWith('Q') && freq.endsWith('H')) {
      const hours = parseInt(freq.slice(1, -1));
      timesPerDay = 24 / hours;
    }

    return `${Math.ceil(days * timesPerDay)} doses`;
  }

  /**
   * Determine priority level for prescription
   */
  private determinePriority(prescription: any): 'ROUTINE' | 'URGENT' | 'STAT' {
    // Check for STAT orders (immediate)
    if (prescription.notes?.toLowerCase().includes('stat')) {
      return 'STAT';
    }

    // Check for urgent antibiotics
    const hasAntibiotics = prescription.items?.some((item: any) => item.medication?.isAntibiotic);
    if (hasAntibiotics) {
      return 'URGENT';
    }

    // Check prescription age
    const ageHours =
      (Date.now() - prescription.prescribedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > 4) {
      return 'URGENT';
    }

    return 'ROUTINE';
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
}
