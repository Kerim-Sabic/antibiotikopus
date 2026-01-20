/**
 * Comprehensive Clinical Rules Database
 *
 * Evidence-based treatment protocols for common conditions
 * Based on WHO, IDSA, EMA, and local Bosnia guidelines
 *
 * AWaRe antibiotic preference: ACCESS > WATCH > RESERVE
 */

import { PrismaClient, AWaReCategory } from '@prisma/client';

const prisma = new PrismaClient();

const clinicalRules = [
  // ============================================================================
  // RESPIRATORY INFECTIONS
  // ============================================================================
  {
    name: 'Community-Acquired Pneumonia (CAP) - Outpatient Adults',
    description: 'Uncomplicated CAP in adults without comorbidities',
    diagnosisCodes: ['J18.9', 'J18.0', 'J18.1'],
    patientCriteria: {
      ageMin: 18,
      ageMax: 65,
      excludeComorbidities: ['COPD', 'Heart failure', 'Diabetes'],
    },
    firstLineChoice: {
      drug: 'amoxicillin',
      dose: '500mg',
      frequency: 'TID',
      duration: '7 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'azithromycin',
        reason: 'Penicillin allergy or atypical pathogen suspected (Mycoplasma, Chlamydia)',
        dose: '500mg',
        frequency: 'QD',
        duration: '5 days',
      },
      {
        drug: 'levofloxacin',
        reason: 'Treatment failure or severe penicillin allergy',
        dose: '750mg',
        frequency: 'QD',
        duration: '5 days',
      },
    ],
    awaRePreference: 'ACCESS' as AWaReCategory,
    guidelineSource: 'WHO AWaRe 2023, IDSA/ATS CAP Guidelines 2019',
    evidenceLevel: 'A',
  },
  {
    name: 'Community-Acquired Pneumonia (CAP) - Inpatient',
    description: 'CAP requiring hospitalization',
    diagnosisCodes: ['J18.9', 'J18.0'],
    patientCriteria: {
      ageMin: 18,
      severity: 'moderate-severe',
    },
    firstLineChoice: {
      drug: 'ceftriaxone',
      dose: '1g',
      frequency: 'QD',
      duration: '7-10 days',
      route: 'IV',
    },
    alternatives: [
      {
        drug: 'levofloxacin',
        reason: 'Beta-lactam allergy',
        dose: '750mg',
        frequency: 'QD',
        duration: '7-10 days',
      },
    ],
    awaRePreference: 'WATCH' as AWaReCategory,
    guidelineSource: 'IDSA/ATS CAP Guidelines 2019',
    evidenceLevel: 'A',
  },
  {
    name: 'Acute Bronchitis (Uncomplicated)',
    description: 'Acute bronchitis in otherwise healthy adults',
    diagnosisCodes: ['J20.9', 'J40'],
    patientCriteria: {
      ageMin: 18,
    },
    firstLineChoice: {
      drug: 'supportive care',
      dose: 'None',
      frequency: 'N/A',
      duration: 'N/A',
      route: 'N/A',
      note: 'Antibiotics NOT recommended for acute bronchitis (usually viral). Treat symptomatically.',
    },
    alternatives: [
      {
        drug: 'amoxicillin',
        reason: 'Only if bacterial pneumonia suspected (persistent fever, purulent sputum >5 days)',
        dose: '500mg',
        frequency: 'TID',
        duration: '5 days',
      },
    ],
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'CDC, NICE Guidelines',
    evidenceLevel: 'A',
  },
  {
    name: 'Acute Otitis Media (Children)',
    description: 'Middle ear infection in pediatric patients',
    diagnosisCodes: ['H66.0', 'H66.9'],
    patientCriteria: {
      ageMin: 0.5,
      ageMax: 12,
    },
    firstLineChoice: {
      drug: 'amoxicillin',
      dose: '80-90 mg/kg/day',
      frequency: 'BID',
      duration: '5-7 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'amoxicillin-clavulanate',
        reason: 'Treatment failure after 48-72 hours or recent antibiotic use',
        dose: '90 mg/kg/day (amoxicillin component)',
        frequency: 'BID',
        duration: '7 days',
      },
      {
        drug: 'azithromycin',
        reason: 'Penicillin allergy',
        dose: '10 mg/kg day 1, then 5 mg/kg',
        frequency: 'QD',
        duration: '5 days',
      },
    ],
    awaRePreference: 'ACCESS' as AWaReCategory,
    guidelineSource: 'AAP Guidelines 2013',
    evidenceLevel: 'A',
  },
  {
    name: 'Acute Sinusitis (Bacterial)',
    description: 'Acute bacterial rhinosinusitis in adults',
    diagnosisCodes: ['J01.9', 'J32.9'],
    patientCriteria: {
      ageMin: 18,
      duration: '>10 days or worsening after initial improvement',
    },
    firstLineChoice: {
      drug: 'amoxicillin',
      dose: '500mg',
      frequency: 'TID',
      duration: '5-7 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'amoxicillin-clavulanate',
        reason: 'Severe infection or high risk of resistance',
        dose: '875mg',
        frequency: 'BID',
        duration: '7 days',
      },
      {
        drug: 'levofloxacin',
        reason: 'Penicillin allergy',
        dose: '500mg',
        frequency: 'QD',
        duration: '5 days',
      },
    ],
    awaRePreference: 'ACCESS' as AWaReCategory,
    guidelineSource: 'IDSA Sinusitis Guidelines 2012',
    evidenceLevel: 'A',
  },

  // ============================================================================
  // URINARY TRACT INFECTIONS
  // ============================================================================
  {
    name: 'Uncomplicated Cystitis (UTI) - Women',
    description: 'Simple lower urinary tract infection in women',
    diagnosisCodes: ['N39.0', 'N30.0'],
    patientCriteria: {
      ageMin: 18,
      gender: 'FEMALE',
      excludeComorbidities: ['Pregnancy', 'Diabetes', 'Immunosuppression'],
    },
    firstLineChoice: {
      drug: 'nitrofurantoin',
      dose: '100mg',
      frequency: 'BID',
      duration: '5 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'trimethoprim-sulfamethoxazole',
        reason: 'If local resistance <20%',
        dose: '160/800mg',
        frequency: 'BID',
        duration: '3 days',
      },
      {
        drug: 'ciprofloxacin',
        reason: 'Alternative if others contraindicated (but avoid due to resistance concerns)',
        dose: '250mg',
        frequency: 'BID',
        duration: '3 days',
      },
    ],
    awaRePreference: 'ACCESS' as AWaReCategory,
    guidelineSource: 'EAU Guidelines 2023, IDSA UTI Guidelines',
    evidenceLevel: 'A',
  },
  {
    name: 'Pyelonephritis (Acute Kidney Infection)',
    description: 'Upper urinary tract infection',
    diagnosisCodes: ['N10', 'N12'],
    patientCriteria: {
      ageMin: 18,
    },
    firstLineChoice: {
      drug: 'ciprofloxacin',
      dose: '500mg',
      frequency: 'BID',
      duration: '7 days',
      route: 'oral (outpatient) or IV (inpatient)',
    },
    alternatives: [
      {
        drug: 'ceftriaxone',
        reason: 'Severe illness or fluoroquinolone resistance',
        dose: '1g',
        frequency: 'QD',
        duration: '10-14 days',
      },
      {
        drug: 'trimethoprim-sulfamethoxazole',
        reason: 'If susceptible on culture',
        dose: '160/800mg',
        frequency: 'BID',
        duration: '14 days',
      },
    ],
    awaRePreference: 'WATCH' as AWaReCategory,
    guidelineSource: 'IDSA UTI Guidelines 2011',
    evidenceLevel: 'A',
  },

  // ============================================================================
  // SKIN & SOFT TISSUE INFECTIONS
  // ============================================================================
  {
    name: 'Cellulitis (Non-purulent)',
    description: 'Acute bacterial skin infection without abscess',
    diagnosisCodes: ['L03.90', 'L03.11'],
    patientCriteria: {
      ageMin: 18,
      noPurulence: true,
    },
    firstLineChoice: {
      drug: 'cephalexin',
      dose: '500mg',
      frequency: 'QID',
      duration: '5-7 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'clindamycin',
        reason: 'Penicillin allergy or MRSA suspected',
        dose: '300mg',
        frequency: 'TID',
        duration: '7 days',
      },
      {
        drug: 'amoxicillin-clavulanate',
        reason: 'Animal/human bite or immunocompromised',
        dose: '875mg',
        frequency: 'BID',
        duration: '7 days',
      },
    ],
    awaRePreference: 'ACCESS' as AWaReCategory,
    guidelineSource: 'IDSA Skin Infections Guidelines 2014',
    evidenceLevel: 'A',
  },

  // ============================================================================
  // GASTROINTESTINAL INFECTIONS
  // ============================================================================
  {
    name: 'Clostridioides difficile Infection (CDI)',
    description: 'C. diff colitis',
    diagnosisCodes: ['A04.7', 'A04.72'],
    patientCriteria: {
      ageMin: 18,
    },
    firstLineChoice: {
      drug: 'vancomycin (oral)',
      dose: '125mg',
      frequency: 'QID',
      duration: '10 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'fidaxomicin',
        reason: 'Recurrent CDI or high risk of recurrence',
        dose: '200mg',
        frequency: 'BID',
        duration: '10 days',
      },
      {
        drug: 'metronidazole',
        reason: 'Mild-moderate disease if vancomycin unavailable (but not preferred)',
        dose: '500mg',
        frequency: 'TID',
        duration: '10 days',
      },
    ],
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'IDSA/SHEA CDI Guidelines 2021',
    evidenceLevel: 'A',
  },

  // ============================================================================
  // CHRONIC CONDITIONS (Non-Antibiotic)
  // ============================================================================
  {
    name: 'Hypertension - Stage 1 (Adults)',
    description: 'Newly diagnosed hypertension without target organ damage',
    diagnosisCodes: ['I10'],
    patientCriteria: {
      ageMin: 18,
      ageMax: 80,
      bloodPressure: 'SBP 130-139 or DBP 80-89',
    },
    firstLineChoice: {
      drug: 'lisinopril (ACE inhibitor)',
      dose: '10mg',
      frequency: 'QD',
      duration: 'Chronic',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'amlodipine (calcium channel blocker)',
        reason: 'ACE inhibitor intolerance (cough) or Black patients',
        dose: '5mg',
        frequency: 'QD',
        duration: 'Chronic',
      },
      {
        drug: 'hydrochlorothiazide (thiazide diuretic)',
        reason: 'Alternative first-line, especially in elderly',
        dose: '12.5-25mg',
        frequency: 'QD',
        duration: 'Chronic',
      },
    ],
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'ACC/AHA Hypertension Guidelines 2017, ESC Guidelines 2018',
    evidenceLevel: 'A',
  },
  {
    name: 'Type 2 Diabetes - Initial Management',
    description: 'Newly diagnosed T2DM or drug-naive',
    diagnosisCodes: ['E11.9', 'E11'],
    patientCriteria: {
      ageMin: 18,
      HbA1c: '>6.5%',
    },
    firstLineChoice: {
      drug: 'metformin',
      dose: '500mg',
      frequency: 'BID (titrate to 1000mg BID)',
      duration: 'Chronic',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'SGLT2 inhibitor (empagliflozin)',
        reason: 'If metformin contraindicated (eGFR<30) or cardiovascular disease present',
        dose: '10mg',
        frequency: 'QD',
        duration: 'Chronic',
      },
      {
        drug: 'GLP-1 agonist (liraglutide)',
        reason: 'If obesity (BMI>30) or cardiovascular disease',
        dose: '0.6mg→1.8mg',
        frequency: 'QD',
        duration: 'Chronic',
      },
    },
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'ADA Standards of Care 2023',
    evidenceLevel: 'A',
  },
  {
    name: 'Asthma - Mild Persistent (Adults)',
    description: 'Asthma with symptoms >2 days/week but not daily',
    diagnosisCodes: ['J45.20', 'J45.30'],
    patientCriteria: {
      ageMin: 12,
    },
    firstLineChoice: {
      drug: 'Low-dose inhaled corticosteroid (budesonide)',
      dose: '200mcg',
      frequency: 'BID',
      duration: 'Chronic',
      route: 'inhalation',
    },
    alternatives: [
      {
        drug: 'Combination ICS/LABA (budesonide-formoterol)',
        reason: 'If symptoms not controlled on ICS alone',
        dose: '200/6mcg',
        frequency: 'BID',
        duration: 'Chronic',
      },
    ],
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'GINA Guidelines 2023',
    evidenceLevel: 'A',
  },
  {
    name: 'Acute Pain - Mild to Moderate',
    description: 'Non-surgical acute pain management',
    diagnosisCodes: ['R52', 'R52.0'],
    patientCriteria: {
      ageMin: 18,
      painLevel: '4-6/10',
    },
    firstLineChoice: {
      drug: 'paracetamol (acetaminophen)',
      dose: '500-1000mg',
      frequency: 'Q4-6H (max 4g/day)',
      duration: 'PRN, up to 7 days',
      route: 'oral',
    },
    alternatives: [
      {
        drug: 'ibuprofen',
        reason: 'If inflammation present or paracetamol insufficient',
        dose: '400mg',
        frequency: 'TID',
        duration: 'PRN, max 7 days',
      },
      {
        drug: 'tramadol',
        reason: 'Moderate pain unresponsive to NSAIDs (use cautiously)',
        dose: '50mg',
        frequency: 'Q6H PRN',
        duration: 'Max 3-5 days',
      },
    ],
    awaRePreference: 'NOT_APPLICABLE' as AWaReCategory,
    guidelineSource: 'WHO Analgesic Ladder, CDC Opioid Guidelines',
    evidenceLevel: 'A',
  },
];

async function seedClinicalRules() {
  console.log('🔬 Seeding clinical rules...');

  let count = 0;

  for (const rule of clinicalRules) {
    try {
      await prisma.clinicalRule.upsert({
        where: { name: rule.name },
        update: rule,
        create: rule,
      });
      count++;
      console.log(`  ✓ ${rule.name}`);
    } catch (error) {
      console.error(`  ✗ Failed to seed: ${rule.name}`, error);
    }
  }

  console.log(`\n✅ Seeded ${count}/${clinicalRules.length} clinical rules`);
}

// Run if called directly
if (require.main === module) {
  seedClinicalRules()
    .catch((e) => {
      console.error('Error seeding clinical rules:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedClinicalRules, clinicalRules };
