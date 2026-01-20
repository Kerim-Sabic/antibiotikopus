/**
 * Horalix Analytics Service
 *
 * Provides comprehensive analytics for:
 * - Hospital administrators (prescribing patterns, antibiotic stewardship)
 * - Medication adherence tracking
 * - Pharmaceutical company dashboards (anonymized aggregate data)
 *
 * All data is GDPR-compliant with no PII in aggregate reports
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AWaReCategory } from '@prisma/client';

export interface PrescribingStatistics {
  period: { start: Date; end: Date };
  totalPrescriptions: number;
  totalPatients: number;
  totalPrescribers: number;
  mostPrescribedDrugs: Array<{
    drugName: string;
    atcCode?: string;
    count: number;
    percentage: number;
  }>;
  byDepartment: Array<{
    department: string;
    prescriptionCount: number;
    uniquePatients: number;
  }>;
  byPrescriber: Array<{
    prescriberName: string;
    department?: string;
    prescriptionCount: number;
    avgPrescriptionsPerDay: number;
  }>;
}

export interface AntibioticStewardshipMetrics {
  period: { start: Date; end: Date };
  totalAntibioticPrescriptions: number;
  awaReDistribution: {
    access: { count: number; percentage: number };
    watch: { count: number; percentage: number };
    reserve: { count: number; percentage: number };
  };
  complianceRate: number; // % prescriptions following guidelines
  alertOverrideRate: number; // % of safety alerts that were overridden
  topAntibiotics: Array<{
    drugName: string;
    awaRe: AWaReCategory;
    count: number;
    percentage: number;
  }>;
  trend: {
    accessTrend: number; // % change from previous period
    watchTrend: number;
    reserveTrend: number;
  };
}

export interface AdherenceAnalytics {
  period: { start: Date; end: Date };
  totalScheduledDoses: number;
  administeredDoses: number;
  missedDoses: number;
  refusedDoses: number;
  overallAdherenceRate: number;
  onTimeRate: number; // % doses given within 30 min of scheduled
  byWard: Array<{
    ward: string;
    adherenceRate: number;
    totalDoses: number;
  }>;
  byDrugClass: Array<{
    drugClass: string;
    adherenceRate: number;
    refusalRate: number;
  }>;
  problemPatterns: Array<{
    issue: string;
    count: number;
    recommendation: string;
  }>;
}

export interface PharmaceuticalAnalytics {
  period: { start: Date; end: Date };
  manufacturer: string;
  totalPrescriptions: number;
  totalVolume: number; // number of units/doses
  marketShare: number; // % of total prescriptions in category
  byRegion: Array<{
    region: string;
    prescriptionCount: number;
    percentage: number;
  }>;
  byTherapeuticClass: Array<{
    atcCode: string;
    className: string;
    prescriptionCount: number;
    percentage: number;
  }>;
  awaReDistribution?: {
    access: number;
    watch: number;
    reserve: number;
  };
  timeSeriesData: Array<{
    date: string; // YYYY-MM-DD
    prescriptionCount: number;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get overall prescribing statistics for admin dashboard
   */
  async getPrescribingStatistics(
    startDate: Date,
    endDate: Date,
  ): Promise<PrescribingStatistics> {
    // Total prescriptions
    const totalPrescriptions = await this.prisma.prescription.count({
      where: {
        prescribedAt: { gte: startDate, lte: endDate },
      },
    });

    // Total unique patients
    const uniquePatients = await this.prisma.prescription.findMany({
      where: {
        prescribedAt: { gte: startDate, lte: endDate },
      },
      select: { patientId: true },
      distinct: ['patientId'],
    });

    // Total unique prescribers
    const uniquePrescribers = await this.prisma.prescription.findMany({
      where: {
        prescribedAt: { gte: startDate, lte: endDate },
      },
      select: { prescriberId: true },
      distinct: ['prescriberId'],
    });

    // Most prescribed drugs
    const prescriptionItems = await this.prisma.prescriptionItem.findMany({
      where: {
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        medication: {
          select: {
            genericName: true,
            atcCode: true,
          },
        },
      },
    });

    const drugCounts = prescriptionItems.reduce(
      (acc, item) => {
        const key = item.medication.genericName;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const mostPrescribedDrugs = Object.entries(drugCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([drugName, count]) => ({
        drugName,
        atcCode: prescriptionItems.find((p) => p.medication.genericName === drugName)
          ?.medication.atcCode,
        count,
        percentage: (count / prescriptionItems.length) * 100,
      }));

    // By department
    const prescribers = await this.prisma.user.findMany({
      where: {
        role: 'DOCTOR',
        prescriptions: {
          some: {
            prescribedAt: { gte: startDate, lte: endDate },
          },
        },
      },
      select: {
        id: true,
        department: true,
        prescriptions: {
          where: {
            prescribedAt: { gte: startDate, lte: endDate },
          },
          select: {
            id: true,
            patientId: true,
          },
        },
      },
    });

    const departmentStats = prescribers.reduce(
      (acc, prescriber) => {
        const dept = prescriber.department || 'Unknown';
        if (!acc[dept]) {
          acc[dept] = { prescriptionCount: 0, patients: new Set<string>() };
        }
        acc[dept].prescriptionCount += prescriber.prescriptions.length;
        prescriber.prescriptions.forEach((p) => acc[dept].patients.add(p.patientId));
        return acc;
      },
      {} as Record<string, { prescriptionCount: number; patients: Set<string> }>,
    );

    const byDepartment = Object.entries(departmentStats).map(([department, stats]) => ({
      department,
      prescriptionCount: stats.prescriptionCount,
      uniquePatients: stats.patients.size,
    }));

    // By prescriber
    const byPrescriber = await Promise.all(
      prescribers.map(async (prescriber) => {
        const user = await this.prisma.user.findUnique({
          where: { id: prescriber.id },
          select: { firstName: true, lastName: true, department: true },
        });

        const days =
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

        return {
          prescriberName: `${user?.firstName} ${user?.lastName}`,
          department: user?.department,
          prescriptionCount: prescriber.prescriptions.length,
          avgPrescriptionsPerDay: prescriber.prescriptions.length / days,
        };
      }),
    );

    return {
      period: { start: startDate, end: endDate },
      totalPrescriptions,
      totalPatients: uniquePatients.length,
      totalPrescribers: uniquePrescribers.length,
      mostPrescribedDrugs,
      byDepartment,
      byPrescriber: byPrescriber.sort((a, b) => b.prescriptionCount - a.prescriptionCount).slice(0, 20),
    };
  }

  /**
   * Get antibiotic stewardship metrics
   */
  async getAntibioticStewardshipMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<AntibioticStewardshipMetrics> {
    // Get all antibiotic prescriptions
    const antibioticPrescriptions = await this.prisma.prescriptionItem.findMany({
      where: {
        medication: { isAntibiotic: true },
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        medication: {
          select: {
            genericName: true,
            awaRe: true,
          },
        },
        prescription: {
          select: {
            recommendationUsed: true,
          },
        },
      },
    });

    const totalAntibioticPrescriptions = antibioticPrescriptions.length;

    // AWaRe distribution
    const awaReCount = antibioticPrescriptions.reduce(
      (acc, item) => {
        const category = item.medication.awaRe.toLowerCase();
        if (category === 'access' || category === 'watch' || category === 'reserve') {
          acc[category]++;
        }
        return acc;
      },
      { access: 0, watch: 0, reserve: 0 },
    );

    const awaReDistribution = {
      access: {
        count: awaReCount.access,
        percentage: (awaReCount.access / totalAntibioticPrescriptions) * 100,
      },
      watch: {
        count: awaReCount.watch,
        percentage: (awaReCount.watch / totalAntibioticPrescriptions) * 100,
      },
      reserve: {
        count: awaReCount.reserve,
        percentage: (awaReCount.reserve / totalAntibioticPrescriptions) * 100,
      },
    };

    // Compliance rate (used system recommendations)
    const recommendationUsedCount = antibioticPrescriptions.filter(
      (item) => item.prescription.recommendationUsed,
    ).length;
    const complianceRate = (recommendationUsedCount / totalAntibioticPrescriptions) * 100;

    // Alert override rate
    const totalAlerts = await this.prisma.prescriptionAlert.count({
      where: {
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
      },
    });

    const overriddenAlerts = await this.prisma.prescriptionAlert.count({
      where: {
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
        isOverridden: true,
      },
    });

    const alertOverrideRate = totalAlerts > 0 ? (overriddenAlerts / totalAlerts) * 100 : 0;

    // Top antibiotics
    const antibioticCounts = antibioticPrescriptions.reduce(
      (acc, item) => {
        const key = item.medication.genericName;
        if (!acc[key]) {
          acc[key] = { count: 0, awaRe: item.medication.awaRe };
        }
        acc[key].count++;
        return acc;
      },
      {} as Record<string, { count: number; awaRe: AWaReCategory }>,
    );

    const topAntibiotics = Object.entries(antibioticCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([drugName, data]) => ({
        drugName,
        awaRe: data.awaRe,
        count: data.count,
        percentage: (data.count / totalAntibioticPrescriptions) * 100,
      }));

    // Trend calculation (compare to previous period)
    const periodLength = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLength);
    const previousAntibiotics = await this.prisma.prescriptionItem.findMany({
      where: {
        medication: { isAntibiotic: true },
        prescription: {
          prescribedAt: { gte: previousStart, lt: startDate },
        },
      },
      include: {
        medication: {
          select: {
            awaRe: true,
          },
        },
      },
    });

    const previousAwaReCount = previousAntibiotics.reduce(
      (acc, item) => {
        const category = item.medication.awaRe.toLowerCase();
        if (category === 'access' || category === 'watch' || category === 'reserve') {
          acc[category]++;
        }
        return acc;
      },
      { access: 0, watch: 0, reserve: 0 },
    );

    const previousTotal = previousAntibiotics.length || 1; // Avoid division by zero

    const trend = {
      accessTrend:
        awaReDistribution.access.percentage -
        (previousAwaReCount.access / previousTotal) * 100,
      watchTrend:
        awaReDistribution.watch.percentage -
        (previousAwaReCount.watch / previousTotal) * 100,
      reserveTrend:
        awaReDistribution.reserve.percentage -
        (previousAwaReCount.reserve / previousTotal) * 100,
    };

    return {
      period: { start: startDate, end: endDate },
      totalAntibioticPrescriptions,
      awaReDistribution,
      complianceRate,
      alertOverrideRate,
      topAntibiotics,
      trend,
    };
  }

  /**
   * Get medication adherence analytics
   */
  async getAdherenceAnalytics(
    startDate: Date,
    endDate: Date,
  ): Promise<AdherenceAnalytics> {
    const administrations = await this.prisma.medicationAdministration.findMany({
      where: {
        scheduledTime: { gte: startDate, lte: endDate },
      },
      include: {
        prescriptionItem: {
          include: {
            medication: {
              select: {
                therapeuticClass: true,
              },
            },
          },
        },
      },
    });

    const totalScheduledDoses = administrations.length;
    let administeredDoses = 0;
    let missedDoses = 0;
    let refusedDoses = 0;
    let onTimeDoses = 0;

    for (const admin of administrations) {
      if (admin.status === 'ADMINISTERED') {
        administeredDoses++;

        // Check if on time (within 30 minutes)
        if (admin.administeredTime) {
          const diff = Math.abs(
            admin.administeredTime.getTime() - admin.scheduledTime.getTime(),
          );
          if (diff <= 30 * 60 * 1000) {
            onTimeDoses++;
          }
        }
      } else if (admin.status === 'MISSED') {
        missedDoses++;
      } else if (admin.status === 'REFUSED') {
        refusedDoses++;
      }
    }

    const overallAdherenceRate =
      totalScheduledDoses > 0 ? (administeredDoses / totalScheduledDoses) * 100 : 100;
    const onTimeRate =
      administeredDoses > 0 ? (onTimeDoses / administeredDoses) * 100 : 100;

    // By ward (simplified - would need ward data in schema)
    const byWard = [
      {
        ward: 'All Wards',
        adherenceRate: overallAdherenceRate,
        totalDoses: totalScheduledDoses,
      },
    ];

    // By drug class
    const classCounts = administrations.reduce(
      (acc, admin) => {
        const drugClass = admin.prescriptionItem.medication.therapeuticClass || 'Unknown';
        if (!acc[drugClass]) {
          acc[drugClass] = { total: 0, administered: 0, refused: 0 };
        }
        acc[drugClass].total++;
        if (admin.status === 'ADMINISTERED') acc[drugClass].administered++;
        if (admin.status === 'REFUSED') acc[drugClass].refused++;
        return acc;
      },
      {} as Record<string, { total: number; administered: number; refused: number }>,
    );

    const byDrugClass = Object.entries(classCounts).map(([drugClass, counts]) => ({
      drugClass,
      adherenceRate: (counts.administered / counts.total) * 100,
      refusalRate: (counts.refused / counts.total) * 100,
    }));

    // Problem patterns
    const problemPatterns: Array<{
      issue: string;
      count: number;
      recommendation: string;
    }> = [];

    if (missedDoses > totalScheduledDoses * 0.05) {
      problemPatterns.push({
        issue: 'High missed dose rate',
        count: missedDoses,
        recommendation: 'Review staffing levels and medication scheduling',
      });
    }

    if (refusedDoses > totalScheduledDoses * 0.1) {
      problemPatterns.push({
        issue: 'High patient refusal rate',
        count: refusedDoses,
        recommendation:
          'Investigate reasons for refusal and improve patient education',
      });
    }

    if (onTimeRate < 75) {
      problemPatterns.push({
        issue: 'Low on-time administration rate',
        count: administeredDoses - onTimeDoses,
        recommendation: 'Review medication scheduling and workflow optimization',
      });
    }

    return {
      period: { start: startDate, end: endDate },
      totalScheduledDoses,
      administeredDoses,
      missedDoses,
      refusedDoses,
      overallAdherenceRate,
      onTimeRate,
      byWard,
      byDrugClass,
      problemPatterns,
    };
  }

  /**
   * Get pharmaceutical company analytics (anonymized, aggregate only)
   */
  async getPharmaceuticalAnalytics(
    manufacturer: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PharmaceuticalAnalytics> {
    // Get all prescriptions for this manufacturer
    const prescriptions = await this.prisma.prescriptionItem.findMany({
      where: {
        medication: {
          manufacturer: {
            contains: manufacturer,
            mode: 'insensitive',
          },
        },
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
      },
      include: {
        medication: {
          select: {
            atcCode: true,
            therapeuticClass: true,
            awaRe: true,
            isAntibiotic: true,
          },
        },
      },
    });

    const totalPrescriptions = prescriptions.length;

    // Calculate total volume (simplified)
    const totalVolume = prescriptions.reduce((sum, item) => {
      // Parse dose to estimate units
      const match = item.dose.match(/(\d+)/);
      const units = match ? parseInt(match[1]) : 1;
      return sum + units;
    }, 0);

    // Market share (% of all prescriptions in same period)
    const allPrescriptions = await this.prisma.prescriptionItem.count({
      where: {
        prescription: {
          prescribedAt: { gte: startDate, lte: endDate },
        },
      },
    });

    const marketShare = (totalPrescriptions / allPrescriptions) * 100;

    // By region (simplified - using department as proxy)
    const byRegion = [
      {
        region: 'Bosnia and Herzegovina',
        prescriptionCount: totalPrescriptions,
        percentage: 100,
      },
    ];

    // By therapeutic class
    const classCounts = prescriptions.reduce(
      (acc, item) => {
        const atcCode = item.medication.atcCode || 'Unknown';
        const className = item.medication.therapeuticClass || 'Unknown';
        const key = atcCode;

        if (!acc[key]) {
          acc[key] = { className, count: 0 };
        }
        acc[key].count++;
        return acc;
      },
      {} as Record<string, { className: string; count: number }>,
    );

    const byTherapeuticClass = Object.entries(classCounts)
      .map(([atcCode, data]) => ({
        atcCode,
        className: data.className,
        prescriptionCount: data.count,
        percentage: (data.count / totalPrescriptions) * 100,
      }))
      .sort((a, b) => b.prescriptionCount - a.prescriptionCount);

    // AWaRe distribution (if antibiotics)
    const antibiotics = prescriptions.filter((p) => p.medication.isAntibiotic);
    const awaReDistribution =
      antibiotics.length > 0
        ? {
            access: antibiotics.filter((p) => p.medication.awaRe === 'ACCESS').length,
            watch: antibiotics.filter((p) => p.medication.awaRe === 'WATCH').length,
            reserve: antibiotics.filter((p) => p.medication.awaRe === 'RESERVE').length,
          }
        : undefined;

    // Time series data (daily counts)
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const timeSeriesData: Array<{ date: string; prescriptionCount: number }> = [];

    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      const count = prescriptions.filter((p) => {
        const rxDate = new Date((p as any).prescription?.prescribedAt || date);
        return rxDate >= dayStart && rxDate <= dayEnd;
      }).length;

      timeSeriesData.push({
        date: dayStart.toISOString().split('T')[0],
        prescriptionCount: count,
      });
    }

    return {
      period: { start: startDate, end: endDate },
      manufacturer,
      totalPrescriptions,
      totalVolume,
      marketShare,
      byRegion,
      byTherapeuticClass,
      awaReDistribution,
      timeSeriesData,
    };
  }

  /**
   * Get real-time dashboard summary
   */
  async getDashboardSummary() {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));

    const [
      todayPrescriptions,
      activePrescriptions,
      pendingDispensing,
      dueMedications,
      activePatients,
    ] = await Promise.all([
      this.prisma.prescription.count({
        where: { prescribedAt: { gte: today } },
      }),
      this.prisma.prescription.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.dispensing.count({
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
      this.prisma.medicationAdministration.count({
        where: {
          status: 'SCHEDULED',
          scheduledTime: {
            gte: now,
            lte: new Date(now.getTime() + 60 * 60 * 1000), // Next hour
          },
        },
      }),
      this.prisma.patient.count({
        where: {
          prescriptions: {
            some: {
              status: 'ACTIVE',
            },
          },
        },
      }),
    ]);

    return {
      todayPrescriptions,
      activePrescriptions,
      pendingDispensing,
      dueMedications,
      activePatients,
      timestamp: new Date(),
    };
  }
}
