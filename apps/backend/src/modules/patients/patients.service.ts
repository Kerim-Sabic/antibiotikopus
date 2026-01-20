import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { Gender, AuditAction } from '@prisma/client';
import { z } from 'zod';

// FHIR-compliant validation schemas
const FHIRPatientSchema = z.object({
  nationalId: z.string().min(13).max(13).regex(/^\d{13}$/, 'Must be 13 digits'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.coerce.date().refine((date) => date < new Date(), 'Date of birth must be in the past'),
  gender: z.nativeEnum(Gender),
  weight: z.number().min(0.5).max(500).optional(),
  height: z.number().min(20).max(250).optional(),
  phone: z.string().regex(/^\+387\s?\d{2}\s?\d{3}\s?\d{3,4}$/).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  isPregnant: z.boolean().default(false),
  isLactating: z.boolean().default(false),
  renalFunction: z.number().min(0).max(200).optional(), // eGFR in mL/min
  hepaticFunction: z.enum(['Normal', 'Mild', 'Moderate', 'Severe']).optional(),
  consentGiven: z.boolean().default(false),
});

export type CreatePatientDto = z.infer<typeof FHIRPatientSchema>;

export interface PatientWithDetails {
  patient: any;
  activePrescriptions: any[];
  recentVitals: any[];
  activeAllergies: any[];
  activeConditions: any[];
  adherenceMetrics?: {
    totalScheduled: number;
    administered: number;
    missed: number;
    refused: number;
    adherenceRate: number;
  };
}

@Injectable()
export class PatientsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Create a new patient with strict FHIR validation
   */
  async create(data: CreatePatientDto, userId: string) {
    // Validate using Zod schema
    const validatedData = FHIRPatientSchema.parse(data);

    // Calculate BSA if height and weight provided (Mosteller formula)
    let bsa: number | undefined;
    if (validatedData.weight && validatedData.height) {
      bsa = Math.sqrt((validatedData.weight * validatedData.height) / 3600);
    }

    // Check for duplicate national ID
    const existing = await this.prisma.patient.findUnique({
      where: { nationalId: validatedData.nationalId },
    });

    if (existing) {
      throw new Error('Patient with this national ID already exists');
    }

    const patient = await this.prisma.patient.create({
      data: {
        ...validatedData,
        bsa,
      },
    });

    // Audit log
    await this.auditService.log({
      userId,
      action: AuditAction.PATIENT_CREATE,
      resourceType: 'Patient',
      resourceId: patient.id,
      details: { nationalId: patient.nationalId },
    });

    return patient;
  }

  /**
   * Find patient by QR/Barcode scan (national ID)
   */
  async findByQRCode(qrData: string): Promise<PatientWithDetails> {
    // QR data should be the national ID
    const nationalId = qrData.trim();

    if (!/^\d{13}$/.test(nationalId)) {
      throw new Error('Invalid QR code format. Expected 13-digit national ID.');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { nationalId },
      include: {
        allergies: {
          where: { verifiedAt: { not: null } },
          orderBy: { severity: 'desc' },
        },
        conditions: {
          where: { isActive: true },
          orderBy: { onsetDate: 'desc' },
        },
        vitalSigns: {
          orderBy: { measuredAt: 'desc' },
          take: 10,
        },
        prescriptions: {
          where: { status: 'ACTIVE' },
          include: {
            items: {
              include: {
                medication: true,
                administrations: {
                  where: {
                    scheduledTime: {
                      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    },
                  },
                },
              },
            },
            prescriber: {
              select: {
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with national ID ${nationalId} not found`);
    }

    // Calculate adherence metrics
    const adherenceMetrics = this.calculateAdherenceMetrics(patient.prescriptions);

    return {
      patient,
      activePrescriptions: patient.prescriptions,
      recentVitals: patient.vitalSigns,
      activeAllergies: patient.allergies,
      activeConditions: patient.conditions,
      adherenceMetrics,
    };
  }

  /**
   * Get comprehensive patient dashboard data
   */
  async getPatientDashboard(patientId: string): Promise<PatientWithDetails> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        allergies: {
          orderBy: { severity: 'desc' },
        },
        conditions: {
          where: { isActive: true },
          orderBy: { onsetDate: 'desc' },
        },
        vitalSigns: {
          orderBy: { measuredAt: 'desc' },
          take: 50, // Last 50 readings for charting
        },
        labResults: {
          orderBy: { resultedAt: 'desc' },
          take: 20,
        },
        prescriptions: {
          where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
          include: {
            items: {
              include: {
                medication: true,
                administrations: {
                  orderBy: { scheduledTime: 'desc' },
                },
              },
            },
            prescriber: {
              select: {
                firstName: true,
                lastName: true,
                role: true,
                licenseNumber: true,
              },
            },
            alerts: true,
          },
          orderBy: { prescribedAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient ${patientId} not found`);
    }

    const activePrescriptions = patient.prescriptions.filter((p) => p.status === 'ACTIVE');
    const adherenceMetrics = this.calculateAdherenceMetrics(activePrescriptions);

    return {
      patient,
      activePrescriptions,
      recentVitals: patient.vitalSigns,
      activeAllergies: patient.allergies,
      activeConditions: patient.conditions,
      adherenceMetrics,
    };
  }

  /**
   * Calculate medication adherence metrics
   */
  private calculateAdherenceMetrics(prescriptions: any[]): {
    totalScheduled: number;
    administered: number;
    missed: number;
    refused: number;
    adherenceRate: number;
  } {
    let totalScheduled = 0;
    let administered = 0;
    let missed = 0;
    let refused = 0;

    for (const prescription of prescriptions) {
      for (const item of prescription.items || []) {
        for (const admin of item.administrations || []) {
          totalScheduled++;

          switch (admin.status) {
            case 'ADMINISTERED':
              administered++;
              break;
            case 'MISSED':
              missed++;
              break;
            case 'REFUSED':
              refused++;
              break;
          }
        }
      }
    }

    const adherenceRate = totalScheduled > 0 ? (administered / totalScheduled) * 100 : 100;

    return {
      totalScheduled,
      administered,
      missed,
      refused,
      adherenceRate: Math.round(adherenceRate * 10) / 10,
    };
  }

  /**
   * Add allergy to patient
   */
  async addAllergy(
    patientId: string,
    data: {
      allergen: string;
      allergenType: string;
      reaction: string;
      severity: string;
    },
    verifiedBy: string,
  ) {
    const allergy = await this.prisma.allergy.create({
      data: {
        patientId,
        allergen: data.allergen,
        allergenType: data.allergenType,
        reaction: data.reaction,
        severity: data.severity,
        verifiedBy,
        verifiedAt: new Date(),
      },
    });

    await this.auditService.log({
      userId: verifiedBy,
      action: AuditAction.PATIENT_UPDATE,
      resourceType: 'Allergy',
      resourceId: allergy.id,
      details: {
        patientId,
        allergen: data.allergen,
        severity: data.severity,
      },
    });

    return allergy;
  }

  /**
   * Add vital signs
   */
  async addVitalSigns(
    patientId: string,
    data: {
      temperature?: number;
      heartRate?: number;
      bloodPressureSys?: number;
      bloodPressureDia?: number;
      respiratoryRate?: number;
      oxygenSaturation?: number;
    },
    measuredBy: string,
  ) {
    return this.prisma.vitalSign.create({
      data: {
        patientId,
        ...data,
        measuredBy,
        measuredAt: new Date(),
      },
    });
  }

  /**
   * Add lab result
   */
  async addLabResult(
    patientId: string,
    data: {
      testName: string;
      testCode?: string;
      value: string;
      unit?: string;
      referenceRange?: string;
      isAbnormal?: boolean;
      collectedAt: Date;
    },
  ) {
    return this.prisma.labResult.create({
      data: {
        patientId,
        ...data,
        resultedAt: new Date(),
      },
    });
  }

  /**
   * Update patient
   */
  async update(patientId: string, data: Partial<CreatePatientDto>, userId: string) {
    // Recalculate BSA if weight or height changed
    let bsa: number | undefined;
    if (data.weight || data.height) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
      });

      const newWeight = data.weight || patient?.weight;
      const newHeight = data.height || patient?.height;

      if (newWeight && newHeight) {
        bsa = Math.sqrt((newWeight * newHeight) / 3600);
      }
    }

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        ...data,
        ...(bsa && { bsa }),
      },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.PATIENT_UPDATE,
      resourceType: 'Patient',
      resourceId: patientId,
      details: { updatedFields: Object.keys(data) },
    });

    return updated;
  }

  /**
   * Search patients by name or national ID
   */
  async search(query: string, limit = 20) {
    return this.prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { nationalId: { contains: query } },
        ],
      },
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        nationalId: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
      },
    });
  }

  /**
   * Get all patients (with pagination)
   */
  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          nationalId: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
        },
      }),
      this.prisma.patient.count(),
    ]);

    return {
      patients,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * GDPR: Right to Erasure
   */
  async deletePatient(patientId: string, userId: string, reason: string) {
    // Check if patient has active prescriptions
    const activeRx = await this.prisma.prescription.count({
      where: {
        patientId,
        status: 'ACTIVE',
      },
    });

    if (activeRx > 0) {
      throw new Error(
        'Cannot delete patient with active prescriptions. Complete or cancel prescriptions first.',
      );
    }

    // Log the deletion
    await this.auditService.log({
      userId,
      action: AuditAction.DATA_DELETE,
      resourceType: 'Patient',
      resourceId: patientId,
      details: { reason },
    });

    // Delete all related data (cascading)
    await this.prisma.patient.delete({
      where: { id: patientId },
    });

    return { message: 'Patient data deleted successfully', patientId };
  }
}
