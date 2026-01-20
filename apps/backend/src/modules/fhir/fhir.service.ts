/**
 * FHIR R4 Interoperability Module
 *
 * Implements HL7 FHIR R4 standard for healthcare data exchange
 * Provides FHIR-compliant endpoints for EHR integration
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  identifier: Array<{
    system: string;
    value: string;
  }>;
  name: Array<{
    family: string;
    given: string[];
  }>;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string; // YYYY-MM-DD
  telecom?: Array<{
    system: 'phone' | 'email';
    value: string;
  }>;
  address?: Array<{
    line: string[];
    city?: string;
    postalCode?: string;
    country: string;
  }>;
}

export interface FHIRMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'completed' | 'cancelled' | 'on-hold';
  intent: 'order';
  medicationCodeableConcept: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
    text: string;
  };
  subject: {
    reference: string; // Patient/[id]
    display: string;
  };
  authoredOn: string; // ISO 8601
  requester: {
    reference: string; // Practitioner/[id]
    display: string;
  };
  dosageInstruction: Array<{
    text: string;
    timing?: {
      repeat: {
        frequency: number;
        period: number;
        periodUnit: 'h' | 'd' | 'wk';
      };
    };
    route?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    doseAndRate: Array<{
      doseQuantity: {
        value: number;
        unit: string;
      };
    }>;
  }>;
  dispenseRequest?: {
    validityPeriod: {
      start: string;
      end: string;
    };
    quantity: {
      value: number;
      unit: string;
    };
  };
}

export interface FHIRMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  status: 'active' | 'completed' | 'not-taken' | 'on-hold';
  medicationCodeableConcept: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
    text: string;
  };
  subject: {
    reference: string;
    display: string;
  };
  effectiveDateTime: string;
  dateAsserted: string;
  informationSource?: {
    reference: string;
    display: string;
  };
  dosage: Array<{
    text: string;
    route?: {
      coding: Array<{
        system: string;
        code: string;
        display: string;
      }>;
    };
    doseAndRate: Array<{
      doseQuantity: {
        value: number;
        unit: string;
      };
    }>;
  }>;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'searchset' | 'collection' | 'transaction';
  total: number;
  entry: Array<{
    resource: FHIRPatient | FHIRMedicationRequest | FHIRMedicationStatement;
  }>;
}

@Injectable()
export class FHIRService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get patient in FHIR format
   */
  async getPatient(patientId: string): Promise<FHIRPatient> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    return {
      resourceType: 'Patient',
      id: patient.id,
      identifier: [
        {
          system: 'http://bih.gov.ba/fhir/national-id',
          value: patient.nationalId || '',
        },
      ],
      name: [
        {
          family: patient.lastName,
          given: [patient.firstName],
        },
      ],
      gender: this.mapGenderToFHIR(patient.gender),
      birthDate: patient.dateOfBirth.toISOString().split('T')[0],
      telecom: [
        ...(patient.phone
          ? [
              {
                system: 'phone' as const,
                value: patient.phone,
              },
            ]
          : []),
        ...(patient.email
          ? [
              {
                system: 'email' as const,
                value: patient.email,
              },
            ]
          : []),
      ],
      ...(patient.address && {
        address: [
          {
            line: [patient.address],
            country: 'BA', // Bosnia and Herzegovina
          },
        ],
      }),
    };
  }

  /**
   * Get prescription as FHIR MedicationRequest
   */
  async getMedicationRequest(prescriptionId: string): Promise<FHIRMedicationRequest> {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: true,
        prescriber: true,
        items: {
          include: {
            medication: true,
          },
        },
      },
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    // For simplicity, taking the first item (in production, might return Bundle of multiple)
    const item = prescription.items[0];

    return {
      resourceType: 'MedicationRequest',
      id: prescription.id,
      status: this.mapPrescriptionStatusToFHIR(prescription.status),
      intent: 'order',
      medicationCodeableConcept: {
        coding: [
          ...(item.medication.atcCode
            ? [
                {
                  system: 'http://www.whocc.no/atc',
                  code: item.medication.atcCode,
                  display: item.medication.genericName,
                },
              ]
            : []),
        ],
        text: item.medication.genericName,
      },
      subject: {
        reference: `Patient/${prescription.patient.id}`,
        display: `${prescription.patient.firstName} ${prescription.patient.lastName}`,
      },
      authoredOn: prescription.prescribedAt.toISOString(),
      requester: {
        reference: `Practitioner/${prescription.prescriber.id}`,
        display: `Dr. ${prescription.prescriber.firstName} ${prescription.prescriber.lastName}`,
      },
      dosageInstruction: [
        {
          text: `${item.dose} ${item.frequency} ${item.route}${item.duration ? ` for ${item.duration}` : ''}`,
          timing: this.parseFrequencyToFHIRTiming(item.frequency),
          route: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: this.mapRouteToSNOMED(item.route),
                display: item.route,
              },
            ],
          },
          doseAndRate: [
            {
              doseQuantity: {
                value: this.parseDoseValue(item.dose),
                unit: this.parseDoseUnit(item.dose),
              },
            },
          ],
        },
      ],
      ...(prescription.startDate &&
        prescription.endDate && {
          dispenseRequest: {
            validityPeriod: {
              start: prescription.startDate.toISOString(),
              end: prescription.endDate.toISOString(),
            },
            quantity: {
              value: this.calculateTotalDoses(item.frequency, item.duration),
              unit: 'doses',
            },
          },
        }),
    };
  }

  /**
   * Get medication administration as FHIR MedicationStatement
   */
  async getMedicationStatement(administrationId: string): Promise<FHIRMedicationStatement> {
    const administration = await this.prisma.medicationAdministration.findUnique({
      where: { id: administrationId },
      include: {
        prescriptionItem: {
          include: {
            medication: true,
            prescription: {
              include: {
                patient: true,
              },
            },
          },
        },
        nurse: true,
      },
    });

    if (!administration) {
      throw new Error('Administration record not found');
    }

    const item = administration.prescriptionItem;

    return {
      resourceType: 'MedicationStatement',
      id: administration.id,
      status: this.mapAdministrationStatusToFHIR(administration.status),
      medicationCodeableConcept: {
        coding: [
          ...(item.medication.atcCode
            ? [
                {
                  system: 'http://www.whocc.no/atc',
                  code: item.medication.atcCode,
                  display: item.medication.genericName,
                },
              ]
            : []),
        ],
        text: item.medication.genericName,
      },
      subject: {
        reference: `Patient/${item.prescription.patient.id}`,
        display: `${item.prescription.patient.firstName} ${item.prescription.patient.lastName}`,
      },
      effectiveDateTime: administration.administeredTime?.toISOString() || administration.scheduledTime.toISOString(),
      dateAsserted: administration.createdAt.toISOString(),
      ...(administration.nurse && {
        informationSource: {
          reference: `Practitioner/${administration.nurse.id}`,
          display: `${administration.nurse.firstName} ${administration.nurse.lastName}`,
        },
      }),
      dosage: [
        {
          text: `${item.dose} ${item.route}`,
          route: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: this.mapRouteToSNOMED(item.route),
                display: item.route,
              },
            ],
          },
          doseAndRate: [
            {
              doseQuantity: {
                value: this.parseDoseValue(item.dose),
                unit: this.parseDoseUnit(item.dose),
              },
            },
          ],
        },
      ],
    };
  }

  /**
   * Get all prescriptions for a patient as FHIR Bundle
   */
  async getPatientMedicationRequestsBundle(patientId: string): Promise<FHIRBundle> {
    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        patient: true,
        prescriber: true,
        items: {
          include: {
            medication: true,
          },
        },
      },
      orderBy: { prescribedAt: 'desc' },
      take: 50, // Limit for performance
    });

    const entries = await Promise.all(
      prescriptions.map(async (prescription) => ({
        resource: await this.getMedicationRequest(prescription.id),
      })),
    );

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: entries.length,
      entry: entries,
    };
  }

  /**
   * Export patient data in FHIR format (for data portability)
   */
  async exportPatientData(patientId: string): Promise<FHIRBundle> {
    const [patient, medicationRequests] = await Promise.all([
      this.getPatient(patientId),
      this.getPatientMedicationRequestsBundle(patientId),
    ]);

    return {
      resourceType: 'Bundle',
      type: 'collection',
      total: 1 + medicationRequests.total,
      entry: [
        { resource: patient },
        ...medicationRequests.entry,
      ],
    };
  }

  // Helper methods

  private mapGenderToFHIR(gender: string): 'male' | 'female' | 'other' | 'unknown' {
    switch (gender) {
      case 'MALE':
        return 'male';
      case 'FEMALE':
        return 'female';
      case 'OTHER':
        return 'other';
      default:
        return 'unknown';
    }
  }

  private mapPrescriptionStatusToFHIR(
    status: string,
  ): 'active' | 'completed' | 'cancelled' | 'on-hold' {
    switch (status) {
      case 'ACTIVE':
        return 'active';
      case 'COMPLETED':
        return 'completed';
      case 'CANCELLED':
        return 'cancelled';
      case 'ON_HOLD':
        return 'on-hold';
      default:
        return 'active';
    }
  }

  private mapAdministrationStatusToFHIR(
    status: string,
  ): 'active' | 'completed' | 'not-taken' | 'on-hold' {
    switch (status) {
      case 'ADMINISTERED':
        return 'completed';
      case 'MISSED':
      case 'REFUSED':
        return 'not-taken';
      case 'HELD':
        return 'on-hold';
      case 'SCHEDULED':
        return 'active';
      default:
        return 'active';
    }
  }

  private parseFrequencyToFHIRTiming(frequency: string): {
    repeat: {
      frequency: number;
      period: number;
      periodUnit: 'h' | 'd' | 'wk';
    };
  } | undefined {
    const freq = frequency.toUpperCase();

    if (freq === 'QD' || freq === 'DAILY') {
      return { repeat: { frequency: 1, period: 1, periodUnit: 'd' } };
    } else if (freq === 'BID') {
      return { repeat: { frequency: 2, period: 1, periodUnit: 'd' } };
    } else if (freq === 'TID') {
      return { repeat: { frequency: 3, period: 1, periodUnit: 'd' } };
    } else if (freq === 'QID') {
      return { repeat: { frequency: 4, period: 1, periodUnit: 'd' } };
    } else if (freq.startsWith('Q') && freq.endsWith('H')) {
      const hours = parseInt(freq.slice(1, -1));
      return { repeat: { frequency: 1, period: hours, periodUnit: 'h' } };
    }

    return undefined;
  }

  private mapRouteToSNOMED(route: string): string {
    const routeMap: Record<string, string> = {
      oral: '26643006',
      IV: '47625008',
      IM: '78421000',
      topical: '6064005',
      rectal: '37161004',
      ophthalmic: '54485002',
    };

    return routeMap[route] || '26643006'; // Default to oral
  }

  private parseDoseValue(dose: string): number {
    const match = dose.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  private parseDoseUnit(dose: string): string {
    const match = dose.match(/\d+\.?\d*\s*(\w+)/);
    return match ? match[1] : 'unit';
  }

  private calculateTotalDoses(frequency: string, duration?: string): number {
    if (!duration) return 0;

    const daysMatch = duration.match(/(\d+)\s*days?/i);
    if (!daysMatch) return 0;

    const days = parseInt(daysMatch[1]);
    const freq = frequency.toUpperCase();

    let timesPerDay = 1;
    if (freq === 'BID') timesPerDay = 2;
    else if (freq === 'TID') timesPerDay = 3;
    else if (freq === 'QID') timesPerDay = 4;

    return days * timesPerDay;
  }
}
