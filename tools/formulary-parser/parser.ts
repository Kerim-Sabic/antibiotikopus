/**
 * Bosnia and Herzegovina National Formulary PDF Parser
 *
 * Parses the official drug registry PDF (Registar lijekova BiH 2025)
 * and extracts structured medication data for the Horalix database.
 *
 * Usage:
 *   npx ts-node parser.ts <path-to-pdf> [--output output.json] [--import-to-db]
 */

import * as fs from 'fs';
import * as path from 'path';

// PDF parsing library (you'll need to install: npm install pdf-parse)
import pdfParse from 'pdf-parse';

interface ParsedMedication {
  genericName: string;
  brandName?: string;
  manufacturer?: string;
  dosageForm: string;
  strength: string;
  route: string;
  packagingInfo?: string;
  registrationNumber?: string;
  prescriptionCategory?: string; // Rp, BRp, ZU
  atcCode?: string;
  isAntibiotic: boolean;
  awaRe: 'ACCESS' | 'WATCH' | 'RESERVE' | 'NOT_APPLICABLE';
  therapeuticClass?: string;
  formularyVersion: string;
}

// WHO AWaRe classification mapping
const AWARE_CLASSIFICATION: Record<string, 'ACCESS' | 'WATCH' | 'RESERVE'> = {
  // ACCESS antibiotics (first-line, low resistance risk)
  'amoxicillin': 'ACCESS',
  'amoxicillin/clavulanic acid': 'ACCESS',
  'amoxicillin + clavulanic acid': 'ACCESS',
  'ampicillin': 'ACCESS',
  'benzylpenicillin': 'ACCESS',
  'penicillin': 'ACCESS',
  'phenoxymethylpenicillin': 'ACCESS',
  'cefalexin': 'ACCESS',
  'cephalexin': 'ACCESS',
  'cefazolin': 'ACCESS',
  'cloxacillin': 'ACCESS',
  'doxycycline': 'ACCESS',
  'gentamicin': 'ACCESS',
  'metronidazole': 'ACCESS',
  'nitrofurantoin': 'ACCESS',
  'sulfamethoxazole/trimethoprim': 'ACCESS',
  'trimethoprim': 'ACCESS',
  'azithromycin': 'ACCESS',
  'clarithromycin': 'ACCESS',
  'erythromycin': 'ACCESS',
  'clindamycin': 'ACCESS',

  // WATCH antibiotics (higher resistance risk)
  'ciprofloxacin': 'WATCH',
  'levofloxacin': 'WATCH',
  'moxifloxacin': 'WATCH',
  'ceftriaxone': 'WATCH',
  'cefotaxime': 'WATCH',
  'ceftazidime': 'WATCH',
  'cefepime': 'WATCH',
  'cefixime': 'WATCH',
  'cefuroxime': 'WATCH',
  'vancomycin': 'WATCH',
  'teicoplanin': 'WATCH',
  'piperacillin/tazobactam': 'WATCH',
  'piperacillin + tazobactam': 'WATCH',

  // RESERVE antibiotics (last resort)
  'meropenem': 'RESERVE',
  'imipenem': 'RESERVE',
  'ertapenem': 'RESERVE',
  'colistin': 'RESERVE',
  'polymyxin': 'RESERVE',
  'tigecycline': 'RESERVE',
  'linezolid': 'RESERVE',
  'daptomycin': 'RESERVE',
  'ceftaroline': 'RESERVE',
  'ceftobiprole': 'RESERVE',
};

// Common antibiotic classes/keywords
const ANTIBIOTIC_KEYWORDS = [
  'cillin',
  'cef',
  'mycin',
  'cycline',
  'floxacin',
  'sulfa',
  'penem',
  'bactam',
  'vancomycin',
  'metronidazole',
  'trimethoprim',
  'colistin',
  'polymyxin',
  'linezolid',
  'daptomycin',
];

// ATC code prefixes for antibiotics
const ANTIBIOTIC_ATC_CODES = ['J01', 'J04', 'A07AA'];

export class FormularyParser {
  private formularyVersion: string;

  constructor(version = '2025') {
    this.formularyVersion = version;
  }

  /**
   * Parse PDF file and extract medication data
   */
  async parsePDF(pdfPath: string): Promise<ParsedMedication[]> {
    console.log(`Reading PDF: ${pdfPath}`);

    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);

    console.log(`Total pages: ${pdfData.numpages}`);
    console.log('Extracting medication entries...');

    const medications = this.extractMedications(pdfData.text);

    console.log(`Extracted ${medications.length} medications`);

    return medications;
  }

  /**
   * Extract medication entries from PDF text
   */
  private extractMedications(text: string): ParsedMedication[] {
    const medications: ParsedMedication[] = [];
    const lines = text.split('\n');

    let currentMedication: Partial<ParsedMedication> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue;

      // Detect medication entry start (typically starts with brand name in caps)
      // Bosnia formulary format varies, but generally:
      // BRAND NAME
      // Generic name
      // Form, Strength
      // Manufacturer
      // Registration number, Category

      // This is a simplified parser - real implementation would need
      // to handle the specific format of the BiH formulary

      // Check if line looks like a brand name (usually ALL CAPS or Title Case)
      if (this.looksLikeBrandName(line)) {
        // Save previous medication if exists
        if (currentMedication && currentMedication.genericName) {
          medications.push(this.finalizeMedication(currentMedication));
        }

        // Start new medication
        currentMedication = {
          brandName: line,
          formularyVersion: this.formularyVersion,
        };
      } else if (currentMedication) {
        // Parse additional fields
        this.parseAdditionalFields(currentMedication, line);
      }
    }

    // Add last medication
    if (currentMedication && currentMedication.genericName) {
      medications.push(this.finalizeMedication(currentMedication));
    }

    return medications;
  }

  /**
   * Check if line looks like a brand name
   */
  private looksLikeBrandName(line: string): boolean {
    // Brand names are often in CAPS or mixed case
    // and don't contain numbers at the start
    return (
      line.length > 2 &&
      line.length < 100 &&
      /^[A-ZÀ-Ž]/.test(line) &&
      !/^\d/.test(line)
    );
  }

  /**
   * Parse additional fields from a line
   */
  private parseAdditionalFields(
    medication: Partial<ParsedMedication>,
    line: string,
  ): void {
    // Extract generic name (often in lowercase or specified format)
    if (!medication.genericName && this.looksLikeGenericName(line)) {
      medication.genericName = this.cleanGenericName(line);
    }

    // Extract strength and dosage form
    const strengthMatch = line.match(/(\d+\.?\d*)\s*(mg|g|ml|mcg|iu|%)/i);
    if (strengthMatch && !medication.strength) {
      medication.strength = strengthMatch[0];
    }

    // Extract dosage form
    const formMatch = this.extractDosageForm(line);
    if (formMatch && !medication.dosageForm) {
      medication.dosageForm = formMatch;
    }

    // Extract manufacturer
    if (this.looksLikeManufacturer(line) && !medication.manufacturer) {
      medication.manufacturer = line;
    }

    // Extract registration number
    const regMatch = line.match(/(\d{2}-\d{2}-\d+-\d+)/);
    if (regMatch && !medication.registrationNumber) {
      medication.registrationNumber = regMatch[1];
    }

    // Extract prescription category
    if ((line.includes('Rp') || line.includes('BRp') || line.includes('ZU')) && !medication.prescriptionCategory) {
      if (line.includes('BRp')) medication.prescriptionCategory = 'BRp';
      else if (line.includes('ZU')) medication.prescriptionCategory = 'ZU';
      else if (line.includes('Rp')) medication.prescriptionCategory = 'Rp';
    }

    // Extract ATC code
    const atcMatch = line.match(/\b([A-Z]\d{2}[A-Z]{2}\d{2})\b/);
    if (atcMatch && !medication.atcCode) {
      medication.atcCode = atcMatch[1];
    }

    // Packaging info
    if (line.match(/\d+\s*x\s*\d+/)) {
      medication.packagingInfo = line;
    }
  }

  /**
   * Check if line looks like a generic name
   */
  private looksLikeGenericName(line: string): boolean {
    // Generic names are usually lowercase or mixed case
    // and often contain chemical terminology
    return (
      line.length > 2 &&
      line.length < 150 &&
      /[a-z]/.test(line) &&
      !this.looksLikeBrandName(line)
    );
  }

  /**
   * Clean and normalize generic name
   */
  private cleanGenericName(line: string): string {
    return line
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s+/()-]/g, '')
      .trim();
  }

  /**
   * Extract dosage form from text
   */
  private extractDosageForm(line: string): string | null {
    const forms = [
      'tablet',
      'tableta',
      'kapsula',
      'capsule',
      'sirup',
      'syrup',
      'injekcija',
      'injection',
      'rastvor',
      'solution',
      'krema',
      'cream',
      'mast',
      'ointment',
      'kapi',
      'drops',
      'sprej',
      'spray',
      'prašak',
      'powder',
      'supozitorij',
      'suppository',
    ];

    for (const form of forms) {
      if (line.toLowerCase().includes(form)) {
        return form;
      }
    }

    return null;
  }

  /**
   * Check if line looks like a manufacturer name
   */
  private looksLikeManufacturer(line: string): boolean {
    const manufacturers = [
      'alkaloid',
      'bosnalijek',
      'galenika',
      'hemofarm',
      'pliva',
      'krka',
      'sandoz',
      'pfizer',
      'novartis',
      'roche',
      'bayer',
      'glaxo',
      'merck',
    ];

    return manufacturers.some((m) => line.toLowerCase().includes(m));
  }

  /**
   * Finalize medication entry with classification
   */
  private finalizeMedication(
    medication: Partial<ParsedMedication>,
  ): ParsedMedication {
    const genericName = medication.genericName || medication.brandName || 'Unknown';
    const route = this.determineRoute(medication.dosageForm || '');

    // Determine if antibiotic
    const isAntibiotic = this.isAntibiotic(
      genericName,
      medication.atcCode,
      medication.therapeuticClass,
    );

    // Determine AWaRe category
    const awaRe = isAntibiotic
      ? this.determineAWaRe(genericName)
      : 'NOT_APPLICABLE';

    return {
      genericName,
      brandName: medication.brandName,
      manufacturer: medication.manufacturer,
      dosageForm: medication.dosageForm || 'unknown',
      strength: medication.strength || 'unknown',
      route,
      packagingInfo: medication.packagingInfo,
      registrationNumber: medication.registrationNumber,
      prescriptionCategory: medication.prescriptionCategory,
      atcCode: medication.atcCode,
      isAntibiotic,
      awaRe,
      therapeuticClass: medication.therapeuticClass,
      formularyVersion: this.formularyVersion,
    };
  }

  /**
   * Determine if medication is an antibiotic
   */
  private isAntibiotic(
    genericName: string,
    atcCode?: string,
    therapeuticClass?: string,
  ): boolean {
    // Check ATC code
    if (atcCode && ANTIBIOTIC_ATC_CODES.some((code) => atcCode.startsWith(code))) {
      return true;
    }

    // Check generic name for antibiotic keywords
    const nameLower = genericName.toLowerCase();
    return ANTIBIOTIC_KEYWORDS.some((keyword) => nameLower.includes(keyword));
  }

  /**
   * Determine AWaRe category for antibiotics
   */
  private determineAWaRe(genericName: string): 'ACCESS' | 'WATCH' | 'RESERVE' | 'NOT_APPLICABLE' {
    const nameLower = genericName.toLowerCase();

    for (const [antibiotic, category] of Object.entries(AWARE_CLASSIFICATION)) {
      if (nameLower.includes(antibiotic.toLowerCase())) {
        return category;
      }
    }

    // Default to ACCESS if antibiotic but not in list
    // (conservative approach - admin can reclassify)
    return 'ACCESS';
  }

  /**
   * Determine route of administration from dosage form
   */
  private determineRoute(dosageForm: string): string {
    const formLower = dosageForm.toLowerCase();

    if (formLower.includes('tablet') || formLower.includes('kapsula') || formLower.includes('sirup')) {
      return 'oral';
    }
    if (formLower.includes('injekcija') || formLower.includes('injection')) {
      return 'IV';
    }
    if (formLower.includes('krema') || formLower.includes('mast')) {
      return 'topical';
    }
    if (formLower.includes('kapi')) {
      return 'ophthalmic';
    }
    if (formLower.includes('supozitorij')) {
      return 'rectal';
    }

    return 'oral'; // default
  }

  /**
   * Save parsed data to JSON file
   */
  async saveToJSON(medications: ParsedMedication[], outputPath: string): Promise<void> {
    fs.writeFileSync(outputPath, JSON.stringify(medications, null, 2), 'utf-8');
    console.log(`Saved ${medications.length} medications to ${outputPath}`);
  }

  /**
   * Generate SQL insert statements for direct database import
   */
  generateSQL(medications: ParsedMedication[]): string {
    let sql = '-- Horalix Bosnia Formulary Import\n';
    sql += '-- Auto-generated from PDF parser\n\n';
    sql += 'BEGIN;\n\n';

    for (const med of medications) {
      const values = [
        this.sqlString(med.genericName),
        this.sqlString(med.brandName),
        this.sqlString(med.atcCode),
        this.sqlString(med.awaRe),
        med.isAntibiotic ? 'TRUE' : 'FALSE',
        this.sqlString(med.therapeuticClass),
        this.sqlString(med.dosageForm),
        this.sqlString(med.strength),
        this.sqlString(med.route),
        this.sqlString(med.registrationNumber),
        this.sqlString(med.prescriptionCategory),
        this.sqlString(med.manufacturer),
        this.sqlString(med.packagingInfo),
        'TRUE', // isActive
        this.sqlString(med.formularyVersion),
      ];

      sql += `INSERT INTO medications (generic_name, brand_name, atc_code, awa_re, is_antibiotic, therapeutic_class, dosage_form, strength, route, registration_number, prescription_category, manufacturer, packaging_info, is_active, formulary_version) VALUES (${values.join(', ')});\n`;
    }

    sql += '\nCOMMIT;\n';

    return sql;
  }

  private sqlString(value?: string): string {
    if (!value) return 'NULL';
    return `'${value.replace(/'/g, "''")}'`;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node parser.ts <pdf-path> [options]');
    console.log('Options:');
    console.log('  --output <file>    Save to JSON file');
    console.log('  --sql <file>       Generate SQL insert statements');
    console.log('  --version <year>   Formulary version (default: 2025)');
    process.exit(1);
  }

  const pdfPath = args[0];
  const outputIndex = args.indexOf('--output');
  const sqlIndex = args.indexOf('--sql');
  const versionIndex = args.indexOf('--version');

  const version = versionIndex !== -1 ? args[versionIndex + 1] : '2025';

  const parser = new FormularyParser(version);
  const medications = await parser.parsePDF(pdfPath);

  if (outputIndex !== -1 && args[outputIndex + 1]) {
    await parser.saveToJSON(medications, args[outputIndex + 1]);
  }

  if (sqlIndex !== -1 && args[sqlIndex + 1]) {
    const sql = parser.generateSQL(medications);
    fs.writeFileSync(args[sqlIndex + 1], sql, 'utf-8');
    console.log(`Generated SQL: ${args[sqlIndex + 1]}`);
  }

  console.log('\nStatistics:');
  console.log(`Total medications: ${medications.length}`);
  console.log(`Antibiotics: ${medications.filter((m) => m.isAntibiotic).length}`);
  console.log(`  - ACCESS: ${medications.filter((m) => m.awaRe === 'ACCESS').length}`);
  console.log(`  - WATCH: ${medications.filter((m) => m.awaRe === 'WATCH').length}`);
  console.log(`  - RESERVE: ${medications.filter((m) => m.awaRe === 'RESERVE').length}`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export default FormularyParser;
