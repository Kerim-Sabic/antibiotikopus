/**
 * Horalix Database Seeder
 *
 * Seeds the database with:
 * - Sample users (all roles)
 * - Sample patients
 * - Sample medications (antibiotics with AWaRe classification)
 * - Sample clinical rules
 * - Sample drug interactions
 */

import { PrismaClient, UserRole, AWaReCategory, Gender, InteractionSeverity } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (in development only!)
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.prescriptionAlert.deleteMany();
    await prisma.medicationAdministration.deleteMany();
    await prisma.dispensing.deleteMany();
    await prisma.prescriptionItem.deleteMany();
    await prisma.prescription.deleteMany();
    await prisma.drugInteraction.deleteMany();
    await prisma.clinicalRule.deleteMany();
    await prisma.medication.deleteMany();
    await prisma.labResult.deleteMany();
    await prisma.vitalSign.deleteMany();
    await prisma.patientCondition.deleteMany();
    await prisma.allergy.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  }

  // 1. Create Users
  console.log('👥 Creating users...');

  const passwordHash = await bcrypt.hash('password123', 10);

  const doctor = await prisma.user.create({
    data: {
      email: 'doctor@horalix.health',
      passwordHash,
      role: UserRole.DOCTOR,
      firstName: 'Emir',
      lastName: 'Hodžić',
      licenseNumber: 'MD-123456',
      department: 'Internal Medicine',
      isActive: true,
    },
  });

  const nurse = await prisma.user.create({
    data: {
      email: 'nurse@horalix.health',
      passwordHash,
      role: UserRole.NURSE,
      firstName: 'Amina',
      lastName: 'Mahmutović',
      department: 'Ward 3A',
      isActive: true,
    },
  });

  const pharmacist = await prisma.user.create({
    data: {
      email: 'pharmacist@horalix.health',
      passwordHash,
      role: UserRole.PHARMACIST,
      firstName: 'Nermin',
      lastName: 'Softić',
      licenseNumber: 'PH-789012',
      department: 'Central Pharmacy',
      isActive: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@horalix.health',
      passwordHash,
      role: UserRole.ADMIN,
      firstName: 'Lejla',
      lastName: 'Kovačević',
      isActive: true,
    },
  });

  console.log(`✓ Created ${4} users`);

  // 2. Create Sample Patients
  console.log('🏥 Creating patients...');

  const patient1 = await prisma.patient.create({
    data: {
      nationalId: '1234567890123',
      firstName: 'Amar',
      lastName: 'Begović',
      dateOfBirth: new Date('1985-06-15'),
      gender: Gender.MALE,
      weight: 80,
      height: 175,
      phone: '+387 61 123 456',
      renalFunction: 90, // Normal eGFR
      hepaticFunction: 'Normal',
      consentGiven: true,
      allergies: {
        create: [
          {
            allergen: 'Penicillin',
            allergenType: 'DRUG',
            reaction: 'Rash and itching',
            severity: 'MODERATE',
            verifiedAt: new Date(),
            verifiedBy: doctor.id,
          },
        ],
      },
      conditions: {
        create: [
          {
            diagnosisCode: 'I10',
            diagnosisName: 'Essential hypertension',
            isActive: true,
            onsetDate: new Date('2020-01-01'),
          },
        ],
      },
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      nationalId: '9876543210987',
      firstName: 'Lejla',
      lastName: 'Hasanović',
      dateOfBirth: new Date('1992-03-22'),
      gender: Gender.FEMALE,
      weight: 65,
      height: 165,
      isPregnant: true,
      phone: '+387 62 987 654',
      renalFunction: 95,
      hepaticFunction: 'Normal',
      consentGiven: true,
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      nationalId: '5555555555555',
      firstName: 'Tarik',
      lastName: 'Muratović',
      dateOfBirth: new Date('2018-09-10'), // Pediatric patient
      gender: Gender.MALE,
      weight: 25,
      height: 120,
      phone: '+387 63 555 555',
      renalFunction: 110, // Normal for child
      hepaticFunction: 'Normal',
      consentGiven: true,
    },
  });

  console.log(`✓ Created ${3} patients`);

  // 3. Create Sample Medications (Antibiotics with AWaRe)
  console.log('💊 Creating medications...');

  // ACCESS Antibiotics
  const amoxicillin = await prisma.medication.create({
    data: {
      genericName: 'Amoxicillin',
      brandName: 'Amoxil',
      atcCode: 'J01CA04',
      awaRe: AWaReCategory.ACCESS,
      isAntibiotic: true,
      therapeuticClass: 'Beta-lactam antibiotics',
      dosageForm: 'Tablet',
      strength: '500mg',
      route: 'oral',
      registrationNumber: '04-05-0123-456',
      prescriptionCategory: 'Rp',
      manufacturer: 'Bosnalijek',
      packagingInfo: '20 tablets',
      indication: 'Bacterial infections including respiratory tract infections',
      formularyVersion: '2025',
    },
  });

  const cephalexin = await prisma.medication.create({
    data: {
      genericName: 'Cefalexin',
      brandName: 'Keflex',
      atcCode: 'J01DB01',
      awaRe: AWaReCategory.ACCESS,
      isAntibiotic: true,
      therapeuticClass: 'First generation cephalosporins',
      dosageForm: 'Capsule',
      strength: '500mg',
      route: 'oral',
      registrationNumber: '04-05-0234-567',
      prescriptionCategory: 'Rp',
      manufacturer: 'Alkaloid',
      packagingInfo: '16 capsules',
      indication: 'Urinary tract infections, skin infections',
      formularyVersion: '2025',
    },
  });

  const azithromycin = await prisma.medication.create({
    data: {
      genericName: 'Azithromycin',
      brandName: 'Sumamed',
      atcCode: 'J01FA10',
      awaRe: AWaReCategory.ACCESS,
      isAntibiotic: true,
      therapeuticClass: 'Macrolides',
      dosageForm: 'Tablet',
      strength: '500mg',
      route: 'oral',
      registrationNumber: '04-05-0345-678',
      prescriptionCategory: 'Rp',
      manufacturer: 'Pliva',
      packagingInfo: '3 tablets',
      indication: 'Respiratory tract infections, atypical pneumonia',
      formularyVersion: '2025',
    },
  });

  // WATCH Antibiotics
  const ciprofloxacin = await prisma.medication.create({
    data: {
      genericName: 'Ciprofloxacin',
      brandName: 'Ciprobay',
      atcCode: 'J01MA02',
      awaRe: AWaReCategory.WATCH,
      isAntibiotic: true,
      therapeuticClass: 'Fluoroquinolones',
      dosageForm: 'Tablet',
      strength: '500mg',
      route: 'oral',
      registrationNumber: '04-05-0456-789',
      prescriptionCategory: 'Rp',
      manufacturer: 'Bayer',
      packagingInfo: '10 tablets',
      indication: 'Complicated urinary tract infections, bone infections',
      formularyVersion: '2025',
    },
  });

  const ceftriaxone = await prisma.medication.create({
    data: {
      genericName: 'Ceftriaxone',
      brandName: 'Rocephin',
      atcCode: 'J01DD04',
      awaRe: AWaReCategory.WATCH,
      isAntibiotic: true,
      therapeuticClass: 'Third generation cephalosporins',
      dosageForm: 'Injection',
      strength: '1g',
      route: 'IV',
      registrationNumber: '04-05-0567-890',
      prescriptionCategory: 'ZU',
      manufacturer: 'Roche',
      packagingInfo: '1 vial',
      indication: 'Severe bacterial infections, meningitis',
      formularyVersion: '2025',
    },
  });

  // RESERVE Antibiotics
  const meropenem = await prisma.medication.create({
    data: {
      genericName: 'Meropenem',
      brandName: 'Meronem',
      atcCode: 'J01DH02',
      awaRe: AWaReCategory.RESERVE,
      isAntibiotic: true,
      therapeuticClass: 'Carbapenems',
      dosageForm: 'Injection',
      strength: '1g',
      route: 'IV',
      registrationNumber: '04-05-0678-901',
      prescriptionCategory: 'ZU',
      manufacturer: 'AstraZeneca',
      packagingInfo: '1 vial',
      indication: 'Severe resistant infections, sepsis',
      formularyVersion: '2025',
    },
  });

  // Non-antibiotic medications
  const paracetamol = await prisma.medication.create({
    data: {
      genericName: 'Paracetamol',
      brandName: 'Paracetamol',
      atcCode: 'N02BE01',
      awaRe: AWaReCategory.NOT_APPLICABLE,
      isAntibiotic: false,
      therapeuticClass: 'Analgesics and antipyretics',
      dosageForm: 'Tablet',
      strength: '500mg',
      route: 'oral',
      registrationNumber: '02-01-0123-456',
      prescriptionCategory: 'BRp',
      manufacturer: 'Bosnalijek',
      packagingInfo: '20 tablets',
      indication: 'Pain and fever',
      formularyVersion: '2025',
    },
  });

  console.log(`✓ Created ${7} medications`);

  // 4. Create Drug Interactions
  console.log('⚠️ Creating drug interactions...');

  await prisma.drugInteraction.create({
    data: {
      drug1Id: ciprofloxacin.id,
      drug2Id: paracetamol.id,
      severity: InteractionSeverity.MINOR,
      description: 'No significant interaction',
      clinicalEffect: 'Minimal clinical significance',
      management: 'No special precautions needed',
    },
  });

  // Example of a major interaction (you would add many more in production)
  // Note: In a real system, you'd import a comprehensive DDI database

  console.log(`✓ Created drug interactions`);

  // 5. Create Clinical Rules
  console.log('📋 Creating clinical rules...');

  await prisma.clinicalRule.create({
    data: {
      name: 'Community-Acquired Pneumonia (CAP) - Adults',
      description: 'First-line treatment for uncomplicated CAP in adults',
      diagnosisCodes: ['J18.9', 'J18.0', 'J18.1'],
      firstLineChoice: {
        drugId: amoxicillin.id,
        dose: '500mg',
        frequency: 'TID',
        duration: '7 days',
        route: 'oral',
      },
      alternatives: [
        {
          drugId: azithromycin.id,
          reason: 'Penicillin allergy or atypical pathogen suspected',
          dose: '500mg',
          frequency: 'QD',
          duration: '5 days',
        },
      ],
      awaRePreference: AWaReCategory.ACCESS,
      guidelineSource: 'WHO AWaRe 2023, IDSA/ATS Guidelines',
      evidenceLevel: 'A',
    },
  });

  await prisma.clinicalRule.create({
    data: {
      name: 'Urinary Tract Infection (UTI) - Uncomplicated',
      description: 'First-line treatment for uncomplicated UTI in adults',
      diagnosisCodes: ['N39.0'],
      firstLineChoice: {
        drugId: cephalexin.id,
        dose: '500mg',
        frequency: 'BID',
        duration: '5 days',
        route: 'oral',
      },
      alternatives: [
        {
          drugId: ciprofloxacin.id,
          reason: 'Complicated UTI or treatment failure',
          dose: '500mg',
          frequency: 'BID',
          duration: '7 days',
        },
      ],
      awaRePreference: AWaReCategory.ACCESS,
      guidelineSource: 'EAU Guidelines 2023',
      evidenceLevel: 'A',
    },
  });

  console.log(`✓ Created ${2} clinical rules`);

  // 6. Create Sample Audit Log
  console.log('📝 Creating sample audit log...');

  await prisma.auditLog.create({
    data: {
      userId: doctor.id,
      action: 'USER_LOGIN',
      resourceType: 'User',
      resourceId: doctor.id,
      details: {
        loginMethod: 'password',
        successful: true,
      },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
    },
  });

  console.log(`✓ Created audit log entries`);

  console.log('\n✅ Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Users: 4 (1 Doctor, 1 Nurse, 1 Pharmacist, 1 Admin)`);
  console.log(`   - Patients: 3`);
  console.log(`   - Medications: 7 (6 Antibiotics, 1 Non-antibiotic)`);
  console.log(`   - Clinical Rules: 2`);
  console.log(`\n🔐 Login credentials (all users):`);
  console.log(`   - Email: [role]@horalix.health`);
  console.log(`   - Password: password123`);
  console.log(`\n   Example: doctor@horalix.health / password123`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
