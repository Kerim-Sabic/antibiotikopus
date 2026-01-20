import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AdministrationStatus, AuditAction, NotificationType } from '@prisma/client';

export interface MAREntry {
  id: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    roomNumber?: string;
  };
  medication: {
    id: string;
    genericName: string;
    brandName?: string;
    strength: string;
    dosageForm: string;
  };
  dose: string;
  route: string;
  scheduledTime: Date;
  status: AdministrationStatus;
  administeredTime?: Date;
  administeredBy?: string;
  notes?: string;
  adverseEvent?: string;
  prescriptionItemId: string;
}

export interface AdministrationStats {
  ward: string;
  totalScheduled: number;
  administered: number;
  missed: number;
  refused: number;
  pending: number;
  onTimeRate: number;
  adherenceRate: number;
}

@Injectable()
export class NursingService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Get Medication Administration Record (MAR) for a ward or all patients
   */
  async getMAR(
    nurseId: string,
    filters?: {
      ward?: string;
      patientId?: string;
      startTime?: Date;
      endTime?: Date;
      status?: AdministrationStatus;
    },
  ): Promise<MAREntry[]> {
    const now = new Date();
    const startTime = filters?.startTime || new Date(now.getTime() - 12 * 60 * 60 * 1000); // Last 12 hours
    const endTime = filters?.endTime || new Date(now.getTime() + 12 * 60 * 60 * 1000); // Next 12 hours

    const administrations = await this.prisma.medicationAdministration.findMany({
      where: {
        scheduledTime: {
          gte: startTime,
          lte: endTime,
        },
        ...(filters?.status && { status: filters.status }),
        prescriptionItem: {
          prescription: {
            patientId: filters?.patientId,
            status: 'ACTIVE',
          },
        },
      },
      include: {
        prescriptionItem: {
          include: {
            medication: true,
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
              },
            },
          },
        },
        nurse: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { scheduledTime: 'asc' },
        { prescriptionItem: { prescription: { patient: { lastName: 'asc' } } } },
      ],
    });

    return administrations.map((admin) => ({
      id: admin.id,
      patient: {
        id: admin.prescriptionItem.prescription.patient.id,
        firstName: admin.prescriptionItem.prescription.patient.firstName,
        lastName: admin.prescriptionItem.prescription.patient.lastName,
        nationalId: admin.prescriptionItem.prescription.patient.nationalId,
      },
      medication: {
        id: admin.prescriptionItem.medication.id,
        genericName: admin.prescriptionItem.medication.genericName,
        brandName: admin.prescriptionItem.medication.brandName || undefined,
        strength: admin.prescriptionItem.medication.strength,
        dosageForm: admin.prescriptionItem.medication.dosageForm,
      },
      dose: admin.prescriptionItem.dose,
      route: admin.prescriptionItem.route,
      scheduledTime: admin.scheduledTime,
      status: admin.status,
      administeredTime: admin.administeredTime || undefined,
      administeredBy: admin.nurse
        ? `${admin.nurse.firstName} ${admin.nurse.lastName}`
        : undefined,
      notes: admin.notes || undefined,
      adverseEvent: admin.adverseEvent || undefined,
      prescriptionItemId: admin.prescriptionItemId,
    }));
  }

  /**
   * Verify patient identity via QR scan before administration
   */
  async verifyPatient(qrCode: string, expectedPatientId: string): Promise<boolean> {
    // QR code should contain the national ID
    const patient = await this.prisma.patient.findUnique({
      where: { nationalId: qrCode.trim() },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found with this QR code');
    }

    if (patient.id !== expectedPatientId) {
      throw new BadRequestException(
        `Patient mismatch! Expected ${expectedPatientId}, scanned patient is ${patient.id}`,
      );
    }

    return true;
  }

  /**
   * Administer medication (mark as given)
   */
  async administerMedication(
    administrationId: string,
    nurseId: string,
    data: {
      patientQRVerified: boolean;
      notes?: string;
      adverseEvent?: string;
    },
  ) {
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
      },
    });

    if (!administration) {
      throw new NotFoundException('Administration record not found');
    }

    if (administration.status === 'ADMINISTERED') {
      throw new BadRequestException('This dose has already been administered');
    }

    // Verify that patient QR was scanned
    if (!data.patientQRVerified) {
      throw new BadRequestException('Patient identity must be verified via QR scan before administration');
    }

    // Update administration record
    const updated = await this.prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status: AdministrationStatus.ADMINISTERED,
        administeredTime: new Date(),
        administeredBy: nurseId,
        notes: data.notes,
        adverseEvent: data.adverseEvent,
      },
    });

    // Audit log
    await this.auditService.log({
      userId: nurseId,
      action: AuditAction.MEDICATION_ADMINISTER,
      resourceType: 'MedicationAdministration',
      resourceId: administrationId,
      details: {
        patientId: administration.prescriptionItem.prescription.patientId,
        medication: administration.prescriptionItem.medication.genericName,
        dose: administration.prescriptionItem.dose,
        adverseEvent: data.adverseEvent,
      },
    });

    // If adverse event reported, create notification for doctor
    if (data.adverseEvent) {
      await this.prisma.notification.create({
        data: {
          userId: administration.prescriptionItem.prescription.prescriberId,
          type: NotificationType.ADVERSE_EVENT,
          title: 'Adverse Event Reported',
          message: `${administration.prescriptionItem.medication.genericName}: ${data.adverseEvent}`,
          relatedResourceType: 'MedicationAdministration',
          relatedResourceId: administrationId,
        },
      });
    }

    return updated;
  }

  /**
   * Mark medication as missed
   */
  async markAsMissed(
    administrationId: string,
    nurseId: string,
    reason: string,
  ) {
    const updated = await this.prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status: AdministrationStatus.MISSED,
        notes: `Missed: ${reason}`,
      },
    });

    await this.auditService.log({
      userId: nurseId,
      action: AuditAction.MEDICATION_ADMINISTER,
      resourceType: 'MedicationAdministration',
      resourceId: administrationId,
      details: {
        status: 'MISSED',
        reason,
      },
    });

    // Notify prescriber if multiple consecutive missed doses
    const recentMissed = await this.prisma.medicationAdministration.count({
      where: {
        prescriptionItemId: updated.prescriptionItemId,
        status: AdministrationStatus.MISSED,
        scheduledTime: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Last 48 hours
        },
      },
    });

    if (recentMissed >= 3) {
      const admin = await this.prisma.medicationAdministration.findUnique({
        where: { id: administrationId },
        include: {
          prescriptionItem: {
            include: {
              medication: true,
              prescription: true,
            },
          },
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: admin!.prescriptionItem.prescription.prescriberId,
          type: NotificationType.MEDICATION_MISSED,
          title: 'Multiple Missed Doses',
          message: `Patient has missed ${recentMissed} doses of ${admin!.prescriptionItem.medication.genericName} in the last 48 hours`,
          relatedResourceType: 'MedicationAdministration',
          relatedResourceId: administrationId,
        },
      });
    }

    return updated;
  }

  /**
   * Mark medication as refused by patient
   */
  async markAsRefused(
    administrationId: string,
    nurseId: string,
    reason: string,
  ) {
    const updated = await this.prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status: AdministrationStatus.REFUSED,
        notes: `Patient refused: ${reason}`,
      },
    });

    await this.auditService.log({
      userId: nurseId,
      action: AuditAction.MEDICATION_ADMINISTER,
      resourceType: 'MedicationAdministration',
      resourceId: administrationId,
      details: {
        status: 'REFUSED',
        reason,
      },
    });

    return updated;
  }

  /**
   * Mark medication as held (clinical decision)
   */
  async holdMedication(
    administrationId: string,
    nurseId: string,
    reason: string,
  ) {
    const updated = await this.prisma.medicationAdministration.update({
      where: { id: administrationId },
      data: {
        status: AdministrationStatus.HELD,
        notes: `Held: ${reason}`,
      },
    });

    await this.auditService.log({
      userId: nurseId,
      action: AuditAction.MEDICATION_ADMINISTER,
      resourceType: 'MedicationAdministration',
      resourceId: administrationId,
      details: {
        status: 'HELD',
        reason,
      },
    });

    // Notify prescriber
    const admin = await this.prisma.medicationAdministration.findUnique({
      where: { id: administrationId },
      include: {
        prescriptionItem: {
          include: {
            medication: true,
            prescription: true,
          },
        },
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: admin!.prescriptionItem.prescription.prescriberId,
        type: NotificationType.MEDICATION_MISSED,
        title: 'Medication Held',
        message: `${admin!.prescriptionItem.medication.genericName} held: ${reason}`,
        relatedResourceType: 'MedicationAdministration',
        relatedResourceId: administrationId,
      },
    });

    return updated;
  }

  /**
   * Get due medications (alerts for nurse)
   */
  async getDueMedications(nurseId: string, ward?: string): Promise<MAREntry[]> {
    const now = new Date();
    const dueWindow = new Date(now.getTime() + 30 * 60 * 1000); // Next 30 minutes

    return this.getMAR(nurseId, {
      ward,
      startTime: now,
      endTime: dueWindow,
      status: AdministrationStatus.SCHEDULED,
    });
  }

  /**
   * Get overdue medications (alerts for nurse)
   */
  async getOverdueMedications(nurseId: string, ward?: string): Promise<MAREntry[]> {
    const now = new Date();
    const overdueStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    return this.getMAR(nurseId, {
      ward,
      startTime: overdueStart,
      endTime: now,
      status: AdministrationStatus.SCHEDULED,
    });
  }

  /**
   * Get administration statistics for a ward
   */
  async getWardStatistics(ward: string, startDate?: Date, endDate?: Date): Promise<AdministrationStats> {
    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const end = endDate || new Date();

    const administrations = await this.prisma.medicationAdministration.findMany({
      where: {
        scheduledTime: {
          gte: start,
          lte: end,
        },
        prescriptionItem: {
          prescription: {
            status: 'ACTIVE',
          },
        },
      },
    });

    const stats = {
      ward,
      totalScheduled: administrations.length,
      administered: 0,
      missed: 0,
      refused: 0,
      pending: 0,
      onTimeRate: 0,
      adherenceRate: 0,
    };

    let onTimeCount = 0;

    for (const admin of administrations) {
      switch (admin.status) {
        case AdministrationStatus.ADMINISTERED:
          stats.administered++;
          // Check if on time (within 30 minutes of scheduled)
          if (
            admin.administeredTime &&
            Math.abs(admin.administeredTime.getTime() - admin.scheduledTime.getTime()) <=
              30 * 60 * 1000
          ) {
            onTimeCount++;
          }
          break;
        case AdministrationStatus.MISSED:
          stats.missed++;
          break;
        case AdministrationStatus.REFUSED:
          stats.refused++;
          break;
        case AdministrationStatus.SCHEDULED:
          stats.pending++;
          break;
      }
    }

    stats.onTimeRate =
      stats.administered > 0 ? Math.round((onTimeCount / stats.administered) * 100) : 0;
    stats.adherenceRate =
      stats.totalScheduled > 0
        ? Math.round((stats.administered / stats.totalScheduled) * 100)
        : 0;

    return stats;
  }

  /**
   * Generate scheduled administrations for a new prescription
   */
  async generateScheduledAdministrations(prescriptionItemId: string) {
    const item = await this.prisma.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: {
        prescription: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Prescription item not found');
    }

    // Parse frequency to generate schedule
    const schedule = this.parseFrequencyToSchedule(
      item.frequency,
      item.prescription.startDate || new Date(),
      item.duration,
    );

    // Create administration records
    const administrations = await Promise.all(
      schedule.map((scheduledTime) =>
        this.prisma.medicationAdministration.create({
          data: {
            prescriptionItemId,
            scheduledTime,
            status: AdministrationStatus.SCHEDULED,
          },
        }),
      ),
    );

    return administrations;
  }

  /**
   * Parse frequency string to schedule times
   * Examples: "BID" (twice daily), "TID" (three times), "Q6H" (every 6 hours)
   */
  private parseFrequencyToSchedule(
    frequency: string,
    startDate: Date,
    duration?: string,
  ): Date[] {
    const schedule: Date[] = [];
    const start = new Date(startDate);

    // Calculate end date from duration (e.g., "7 days")
    let endDate = new Date(start);
    if (duration) {
      const daysMatch = duration.match(/(\d+)\s*days?/i);
      if (daysMatch) {
        endDate = new Date(start.getTime() + parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000);
      }
    } else {
      // Default to 30 days if no duration specified
      endDate = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // Parse frequency
    const freq = frequency.toUpperCase();
    let timesPerDay = 1;
    let hoursInterval: number | null = null;

    if (freq === 'QD' || freq === 'DAILY') {
      timesPerDay = 1;
    } else if (freq === 'BID') {
      timesPerDay = 2;
    } else if (freq === 'TID') {
      timesPerDay = 3;
    } else if (freq === 'QID') {
      timesPerDay = 4;
    } else if (freq.startsWith('Q') && freq.endsWith('H')) {
      // Q6H, Q8H, etc.
      const hours = parseInt(freq.slice(1, -1));
      hoursInterval = hours;
    }

    // Generate schedule
    let currentDate = new Date(start);

    if (hoursInterval) {
      // Fixed interval (e.g., every 6 hours)
      while (currentDate <= endDate) {
        schedule.push(new Date(currentDate));
        currentDate = new Date(currentDate.getTime() + hoursInterval * 60 * 60 * 1000);
      }
    } else {
      // Times per day (standard dosing times)
      const standardTimes = this.getStandardDosingTimes(timesPerDay);

      while (currentDate <= endDate) {
        for (const time of standardTimes) {
          const scheduledTime = new Date(currentDate);
          scheduledTime.setHours(time.hours, time.minutes, 0, 0);

          if (scheduledTime >= start && scheduledTime <= endDate) {
            schedule.push(scheduledTime);
          }
        }

        currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    return schedule;
  }

  /**
   * Get standard hospital dosing times
   */
  private getStandardDosingTimes(timesPerDay: number): Array<{ hours: number; minutes: number }> {
    switch (timesPerDay) {
      case 1:
        return [{ hours: 9, minutes: 0 }];
      case 2:
        return [
          { hours: 9, minutes: 0 },
          { hours: 21, minutes: 0 },
        ];
      case 3:
        return [
          { hours: 9, minutes: 0 },
          { hours: 15, minutes: 0 },
          { hours: 21, minutes: 0 },
        ];
      case 4:
        return [
          { hours: 9, minutes: 0 },
          { hours: 13, minutes: 0 },
          { hours: 17, minutes: 0 },
          { hours: 21, minutes: 0 },
        ];
      default:
        return [{ hours: 9, minutes: 0 }];
    }
  }
}
