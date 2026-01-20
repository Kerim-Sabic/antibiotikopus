import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AWaReCategory, Medication } from '@prisma/client';

export interface MedicationSearchQuery {
  query?: string;
  isAntibiotic?: boolean;
  awaRe?: AWaReCategory;
  atcCode?: string;
  therapeuticClass?: string;
  route?: string;
  dosageForm?: string;
  manufacturer?: string;
  limit?: number;
  offset?: number;
}

export interface MedicationWithAlternatives {
  medication: Medication;
  alternatives: Medication[]; // Same generic, different brands/manufacturers
  interactsWith?: Array<{
    medicationId: string;
    medicationName: string;
    severity: string;
    description: string;
  }>;
}

@Injectable()
export class MedicationsService {
  private readonly CACHE_PREFIX = 'med:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Search medications with filters
   */
  async search(query: MedicationSearchQuery): Promise<{
    medications: Medication[];
    total: number;
  }> {
    const where: any = {
      isActive: true,
    };

    // Full-text search on generic and brand names
    if (query.query) {
      where.OR = [
        { genericName: { contains: query.query, mode: 'insensitive' } },
        { brandName: { contains: query.query, mode: 'insensitive' } },
        { indication: { contains: query.query, mode: 'insensitive' } },
      ];
    }

    if (query.isAntibiotic !== undefined) {
      where.isAntibiotic = query.isAntibiotic;
    }

    if (query.awaRe) {
      where.awaRe = query.awaRe;
    }

    if (query.atcCode) {
      where.atcCode = { startsWith: query.atcCode };
    }

    if (query.therapeuticClass) {
      where.therapeuticClass = { contains: query.therapeuticClass, mode: 'insensitive' };
    }

    if (query.route) {
      where.route = query.route;
    }

    if (query.dosageForm) {
      where.dosageForm = query.dosageForm;
    }

    if (query.manufacturer) {
      where.manufacturer = { contains: query.manufacturer, mode: 'insensitive' };
    }

    const [medications, total] = await Promise.all([
      this.prisma.medication.findMany({
        where,
        take: query.limit || 50,
        skip: query.offset || 0,
        orderBy: [
          { isAntibiotic: 'desc' }, // Antibiotics first if searching
          { genericName: 'asc' },
        ],
      }),
      this.prisma.medication.count({ where }),
    ]);

    return { medications, total };
  }

  /**
   * Get medications by AWaRe category (for antibiotic stewardship tab)
   */
  async getByAWaRe(category: AWaReCategory, limit = 100) {
    const cacheKey = `${this.CACHE_PREFIX}aware:${category}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const medications = await this.prisma.medication.findMany({
      where: {
        isAntibiotic: true,
        awaRe: category,
        isActive: true,
      },
      take: limit,
      orderBy: {
        genericName: 'asc',
      },
    });

    await this.redis.set(cacheKey, JSON.stringify(medications), this.CACHE_TTL);

    return medications;
  }

  /**
   * Get all antibiotics grouped by AWaRe category
   */
  async getAntibioticsByAWaRe() {
    const cacheKey = `${this.CACHE_PREFIX}antibiotics_grouped`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const [access, watch, reserve] = await Promise.all([
      this.getByAWaRe(AWaReCategory.ACCESS),
      this.getByAWaRe(AWaReCategory.WATCH),
      this.getByAWaRe(AWaReCategory.RESERVE),
    ]);

    const result = {
      access,
      watch,
      reserve,
      statistics: {
        totalAccess: access.length,
        totalWatch: watch.length,
        totalReserve: reserve.length,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);

    return result;
  }

  /**
   * Get medication by ID with alternatives (same generic, different brands)
   */
  async findOneWithAlternatives(id: string): Promise<MedicationWithAlternatives> {
    const medication = await this.prisma.medication.findUnique({
      where: { id },
    });

    if (!medication) {
      throw new Error('Medication not found');
    }

    // Find alternatives with same generic name
    const alternatives = await this.prisma.medication.findMany({
      where: {
        genericName: medication.genericName,
        id: { not: id },
        isActive: true,
      },
      orderBy: {
        manufacturer: 'asc',
      },
    });

    // Get known interactions
    const interactions = await this.prisma.drugInteraction.findMany({
      where: {
        OR: [{ drug1Id: id }, { drug2Id: id }],
      },
      include: {
        drug1: true,
        drug2: true,
      },
      take: 20,
    });

    const interactsWith = interactions.map((int) => ({
      medicationId: int.drug1Id === id ? int.drug2Id : int.drug1Id,
      medicationName:
        int.drug1Id === id ? int.drug2.genericName : int.drug1.genericName,
      severity: int.severity,
      description: int.description,
    }));

    return {
      medication,
      alternatives,
      interactsWith,
    };
  }

  /**
   * Get medications by therapeutic category (ATC classification)
   */
  async getByTherapeuticCategory(atcPrefix: string) {
    return this.prisma.medication.findMany({
      where: {
        atcCode: { startsWith: atcPrefix },
        isActive: true,
      },
      orderBy: {
        genericName: 'asc',
      },
    });
  }

  /**
   * Get all unique manufacturers from formulary
   */
  async getManufacturers(): Promise<string[]> {
    const medications = await this.prisma.medication.findMany({
      where: {
        manufacturer: { not: null },
        isActive: true,
      },
      select: {
        manufacturer: true,
      },
      distinct: ['manufacturer'],
      orderBy: {
        manufacturer: 'asc',
      },
    });

    return medications
      .map((m) => m.manufacturer)
      .filter((m): m is string => m !== null);
  }

  /**
   * Get available routes of administration
   */
  async getRoutes(): Promise<string[]> {
    const medications = await this.prisma.medication.findMany({
      where: { isActive: true },
      select: { route: true },
      distinct: ['route'],
      orderBy: { route: 'asc' },
    });

    return medications.map((m) => m.route);
  }

  /**
   * Get available dosage forms
   */
  async getDosageForms(): Promise<string[]> {
    const medications = await this.prisma.medication.findMany({
      where: { isActive: true },
      select: { dosageForm: true },
      distinct: ['dosageForm'],
      orderBy: { dosageForm: 'asc' },
    });

    return medications.map((m) => m.dosageForm);
  }

  /**
   * Get medication statistics (for admin dashboard)
   */
  async getStatistics() {
    const [
      totalMedications,
      totalAntibiotics,
      accessCount,
      watchCount,
      reserveCount,
      byRoute,
      byForm,
    ] = await Promise.all([
      this.prisma.medication.count({ where: { isActive: true } }),
      this.prisma.medication.count({
        where: { isActive: true, isAntibiotic: true },
      }),
      this.prisma.medication.count({
        where: { isActive: true, awaRe: AWaReCategory.ACCESS },
      }),
      this.prisma.medication.count({
        where: { isActive: true, awaRe: AWaReCategory.WATCH },
      }),
      this.prisma.medication.count({
        where: { isActive: true, awaRe: AWaReCategory.RESERVE },
      }),
      this.prisma.medication.groupBy({
        by: ['route'],
        where: { isActive: true },
        _count: true,
      }),
      this.prisma.medication.groupBy({
        by: ['dosageForm'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    return {
      totalMedications,
      totalAntibiotics,
      awaRe: {
        access: accessCount,
        watch: watchCount,
        reserve: reserveCount,
      },
      byRoute: byRoute.map((r) => ({ route: r.route, count: r._count })),
      byDosageForm: byForm.map((f) => ({ form: f.dosageForm, count: f._count })),
    };
  }

  /**
   * Create a new medication (admin only)
   */
  async create(data: {
    genericName: string;
    brandName?: string;
    atcCode?: string;
    awaRe?: AWaReCategory;
    isAntibiotic?: boolean;
    therapeuticClass?: string;
    dosageForm: string;
    strength: string;
    route: string;
    registrationNumber?: string;
    prescriptionCategory?: string;
    manufacturer?: string;
    packagingInfo?: string;
    indication?: string;
    contraindications?: string;
    sideEffects?: string;
    formularyVersion?: string;
  }) {
    // Clear cache after creating
    await this.clearCache();

    return this.prisma.medication.create({
      data: {
        ...data,
        isAntibiotic: data.isAntibiotic || false,
        awaRe: data.awaRe || AWaReCategory.NOT_APPLICABLE,
      },
    });
  }

  /**
   * Bulk import medications (for formulary parser)
   */
  async bulkImport(medications: any[]) {
    await this.clearCache();

    return this.prisma.medication.createMany({
      data: medications,
      skipDuplicates: true,
    });
  }

  /**
   * Update medication
   */
  async update(id: string, data: Partial<Medication>) {
    await this.clearCache();

    return this.prisma.medication.update({
      where: { id },
      data,
    });
  }

  /**
   * Deactivate medication (don't delete, for audit trail)
   */
  async deactivate(id: string) {
    await this.clearCache();

    return this.prisma.medication.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Clear medication cache
   */
  private async clearCache() {
    const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => this.redis.del(key)));
    }
  }
}
