# Horalix 🏥

> **Hospital-grade drug prescribing platform with built-in antibiotic stewardship and clinical decision support**

Horalix is a comprehensive medication management system designed for healthcare providers in Bosnia and Herzegovina. It combines evidence-based clinical guidelines, WHO AWaRe antibiotic classification, and patient safety checks to support clinicians in making informed prescribing decisions.

## 🌟 Key Features

### 🔍 Clinical Workflows (Production-Ready)

#### Patient Management
- **QR Code Patient Verification**: 13-digit national ID scanning for patient identification
- **FHIR R4 Compliant**: Full HL7 FHIR interoperability for EHR integration
- **Comprehensive Dashboard**: Real-time patient data with vital signs, lab results, medication history
- **Medication Adherence Tracking**: Automatic calculation of adherence rates and missed doses
- **Strict Data Validation**: Zod schema validation for all patient data
- **GDPR Right to Erasure**: Complete data deletion with audit trail

#### Nursing MAR (Medication Administration Record)
- **Dose Scheduling**: Auto-generation of administration schedules from prescriptions
- **Five Rights Verification**: QR scanning for patient AND medication verification
- **Real-Time Alerts**: Due medications, overdue doses, and adverse event tracking
- **Administration Status Tracking**: Given/Missed/Refused/Held with timestamps
- **Automatic Notifications**: Alerts to prescribers for multiple missed doses or adverse events
- **Ward-Level Statistics**: Adherence rates, on-time administration, and problem patterns

#### Pharmacy Dispensing Dashboard
- **Real-Time Queue Management**: Priority-based (STAT/URGENT/ROUTINE) prescription queue
- **Substitution Engine**: Therapeutic equivalence validation with ATC code matching
- **Safety Re-checks**: Automatic safety validation for all substitutions
- **Out-of-Stock Handling**: Automated prescriber notification and alternative suggestions
- **Dispensing Analytics**: Average turnaround time, substitution rates, and workload metrics

### 📊 Analytics & Reporting

#### Admin Dashboard
- **Prescribing Statistics**: Total prescriptions, top drugs, by department/prescriber
- **Antibiotic Stewardship**: AWaRe category distribution (Access/Watch/Reserve)
- **Compliance Metrics**: Guideline adherence rate, alert override tracking
- **Trend Analysis**: Period-over-period comparison of prescribing patterns
- **Real-Time Summary**: Active prescriptions, pending dispensing, due medications

#### Adherence Analytics
- **Overall Metrics**: Adherence rate, on-time rate (within 30 min), missed/refused doses
- **By Ward Analysis**: Department-level adherence tracking
- **By Drug Class**: Medication-specific adherence and refusal rates
- **Problem Patterns**: Automated detection with actionable recommendations

#### Pharmaceutical Analytics (Anonymized)
- **Market Share Analysis**: Manufacturer prescription volumes and trends
- **Therapeutic Class Breakdown**: ATC code-based distribution
- **Time Series Data**: Daily prescription counts for trend analysis
- **AWaRe Distribution**: Antibiotic category usage for manufacturers
- **GDPR-Compliant**: Fully anonymized, aggregate-only data

### 🔬 Clinical Decision Support

#### Comprehensive Rule Database (15+ Conditions)
**Respiratory Infections:**
- Community-Acquired Pneumonia (outpatient/inpatient)
- Acute Bronchitis (with antibiotic stewardship guidance)
- Acute Sinusitis
- Acute Otitis Media (pediatric dosing)

**Urinary Tract Infections:**
- Uncomplicated Cystitis
- Pyelonephritis (with IV/oral options)

**Skin Infections:**
- Cellulitis (non-purulent)
- MRSA-suspected infections

**GI Infections:**
- Clostridioides difficile colitis

**Chronic Conditions:**
- Hypertension (with ACC/AHA 2017 guidelines)
- Type 2 Diabetes (ADA 2023 standards)
- Asthma (GINA 2023)
- Acute Pain Management (WHO ladder)

All rules include:
- Evidence level (A/B/C grading)
- Guideline sources (WHO, IDSA, EMA, ADA, etc.)
- First-line and alternative options
- Patient-specific criteria
- AWaRe antibiotic preference

### 🔐 QR Code Verification System
- **Patient QR**: National ID only (no other PII)
- **Prescription QR**: Secure token-based verification (30-day expiry)
- **Medication QR**: Prescription item verification for nursing
- **Printable Output**: Professional prescription format with embedded QR codes
- **Five Rights Support**: Scan-based verification for medication administration

### 📱 Progressive Web App (PWA)
- **Offline Functionality**: Service worker caching for continuity of care
- **Cache Strategies**: Cache-first for assets, network-first for API
- **Background Sync**: Automatic retry of failed operations when back online
- **Push Notifications**: Real-time alerts for due medications and critical events
- **App Shortcuts**: Quick access to prescriptions, MAR, pharmacy queue
- **Installable**: Add to home screen on mobile devices

### 🛡️ Safety Engine
- ✅ **Allergy Checks**: Cross-sensitivity detection (e.g., penicillin → cephalosporins)
- ⚠️ **Drug-Drug Interactions**: Real-time DDI screening with severity grading
- 🚫 **Contraindications**: Patient condition-based warnings
- 📊 **Duplicate Therapy**: Detection of therapeutic overlap
- 💊 **Dose Validation**: Age-appropriate and organ function-adjusted dosing
- 🤰 **Pregnancy/Lactation**: Safety categorization and warnings
- 🧓 **Age-Specific**: Pediatric and geriatric considerations
- 🔄 **Renal/Hepatic Adjustments**: Automatic dose modification recommendations

### 👥 Role-Based Workflows
- **Doctors**: Prescribing with clinical decision support, safety alerts, and override justification
- **Nurses**: MAR access, QR verification, administration tracking, adverse event reporting
- **Pharmacists**: Dispensing queue, substitution validation, inventory management
- **Admins**: Analytics dashboards, user management, audit logs, formulary updates

### 🔒 Compliance & Privacy
- **GDPR-Compliant**: Data minimization, consent management, right to erasure
- **FHIR R4 Interoperability**: Patient, MedicationRequest, MedicationStatement resources
- **End-to-End Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Two-Factor Authentication**: TOTP-based 2FA for all users
- **Immutable Audit Trail**: Every action logged (who, what, when, why)
- **Alert Override Tracking**: Mandatory justification for safety alert overrides

## 🏗️ Architecture

```
horalix/
├── apps/
│   ├── backend/           # NestJS API server
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # Authentication & 2FA
│   │   │   │   ├── patients/       # Patient management
│   │   │   │   ├── medications/    # Drug formulary
│   │   │   │   ├── prescriptions/  # Prescription CRUD
│   │   │   │   ├── rules-engine/   # Clinical decision support
│   │   │   │   ├── safety-engine/  # Safety checks
│   │   │   │   ├── pharmacy/       # Dispensing
│   │   │   │   └── nursing/        # Administration
│   │   │   └── common/
│   │   │       ├── prisma/         # Database service
│   │   │       ├── redis/          # Caching
│   │   │       └── audit/          # Audit logging
│   │   └── prisma/
│   │       └── schema.prisma       # Database schema
│   ├── web/               # Next.js web application
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── DrugNavigator/  # Medication search
│   │   │   │   ├── SafetyAlerts/   # Alert display
│   │   │   │   ├── Prescription/   # Prescription forms
│   │   │   │   └── Dashboard/      # Role-specific dashboards
│   │   │   ├── hooks/              # React hooks
│   │   │   ├── lib/                # API client
│   │   │   └── locales/            # i18n (Bosnian/English)
│   │   └── public/
│   └── mobile/            # React Native iOS/Android
├── packages/
│   ├── shared/            # Shared utilities
│   └── types/             # TypeScript definitions
└── tools/
    └── formulary-parser/  # BiH PDF parser
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and npm/yarn/pnpm
- **PostgreSQL** 15+
- **Redis** 7+
- **Docker** (optional, for containerized deployment)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-org/horalix.git
cd horalix
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Backend (`apps/backend/.env`):
```env
DATABASE_URL="postgresql://horalix:password@localhost:5432/horalix"
JWT_SECRET="your-super-secret-jwt-key"
REDIS_HOST="localhost"
REDIS_PORT=6379
PORT=3001
```

4. **Initialize the database**
```bash
cd apps/backend
npx prisma migrate dev
npx prisma db seed
```

5. **Import Bosnia Formulary (2025)**

```bash
cd tools/formulary-parser
npm install
npx ts-node parser.ts /path/to/Registar2025.pdf --output formulary.json
```

6. **Start development servers**

Backend:
```bash
cd apps/backend
npm run dev
```

Web:
```bash
cd apps/web
npm run dev
```

7. **Access**: Web at http://localhost:3000, API at http://localhost:3001

## 📚 Clinical Decision Support

### How It Works

1. **Patient Intake**: Scan QR code or search by national ID → Retrieve complete medical history
2. **Diagnosis Entry**: ICD-10 code or free text → Matches against 15+ clinical rule database
3. **Rule Matching**: System finds evidence-based protocols considering:
   - Patient allergies, age, weight, organ function
   - Current medications (interaction checking)
   - WHO AWaRe classification (prefers Access antibiotics)
   - Pregnancy/lactation status, comorbidities
4. **Safety Validation**: Comprehensive checks for allergies, interactions, contraindications
5. **Recommendation Display**: Primary choice + alternatives with full clinical rationale
6. **Prescription Generation**: QR-embedded prescription for pharmacy/nursing verification

### Example Clinical Workflow

**Scenario**: 45-year-old male with community-acquired pneumonia, penicillin allergy

```
PATIENT SCAN → QR Code Verified (National ID: 1234567890123)

DIAGNOSIS: Community-Acquired Pneumonia (J18.9)

SYSTEM ANALYSIS:
✓ Patient age: 45 years (adult dosing)
✓ Weight: 80kg → BSA: 1.98 m²
✓ eGFR: 90 mL/min (normal renal function)
⚠ ALLERGY: Penicillin (moderate severity)
✓ No current medications
✓ No contraindications

RULE MATCHED: "Community-Acquired Pneumonia - Outpatient Adults"
Guideline: WHO AWaRe 2023, IDSA/ATS CAP Guidelines 2019
Evidence Level: A

PRIMARY RECOMMENDATION:
❌ Amoxicillin 500mg PO TID x 7 days (BLOCKED by allergy)

ALTERNATIVE SELECTED:
✅ Azithromycin 500mg PO QD x 5 days

Rationale:
• Access antibiotic (low AMR risk)
• Covers atypical pathogens (Mycoplasma, Chlamydia)
• Safe in penicillin allergy (no cross-sensitivity)
• Excellent compliance (once daily, short course)
• Evidence: WHO AWaRe 2023 (Level A)

SAFETY CHECKS:
✅ No drug interactions
✅ No contraindications
✅ Dose appropriate for renal function
✅ No pregnancy/lactation concerns

[PRESCRIPTION GENERATED]
QR Code: RX_TOKEN:a4f8b2... (valid 30 days)
Ready for pharmacy dispensing
```

## 🔒 Security & Compliance

- **GDPR Compliant**: Data minimization, consent management, right to erasure
- **Audit Trail**: Every action logged (who, what, when, why)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Authentication**: JWT + 2FA, session management
- **Alert Overrides**: Require clinical justification (logged)

## 📊 Bosnia Formulary Parser

The `tools/formulary-parser` utility extracts medication data from the official PDF:

```bash
npx ts-node parser.ts Registar2025.pdf --output meds.json --sql import.sql
```

Extracts:
- Generic and brand names
- Manufacturer, strength, dosage form
- Registration numbers
- Prescription category (Rp/BRp/ZU)
- ATC codes
- Automatic AWaRe classification for antibiotics

## 🏥 Production-Grade Hospital Features

### Complete Clinical Workflows

**Doctor Workflow:**
1. QR scan or search patient → View comprehensive dashboard
2. Enter diagnosis → Receive evidence-based recommendations
3. Review safety alerts → Override with justification if needed
4. Generate prescription → QR-embedded for verification
5. Track adherence → View patient compliance metrics

**Nurse Workflow:**
1. Access MAR (Medication Administration Record)
2. View due medications with alerts
3. QR scan patient → QR scan medication → Five-rights verification
4. Administer or document reason (missed/refused/held)
5. Report adverse events → Auto-notify prescriber

**Pharmacist Workflow:**
1. View priority-based dispensing queue (STAT/URGENT/ROUTINE)
2. Check medication availability
3. Validate substitutions with safety engine
4. Dispense and confirm → Notify nursing
5. Track metrics (turnaround time, substitution rate)

**Admin Workflow:**
1. Monitor real-time dashboard (active Rx, pending dispensing)
2. Analyze prescribing patterns and AWaRe distribution
3. Track antibiotic stewardship metrics
4. Review adherence analytics by ward/drug class
5. Audit alert overrides and user activity

### Evidence-Based Medicine

All clinical recommendations are based on:
- **WHO Guidelines**: AWaRe antibiotic classification, Essential Medicines List
- **IDSA**: Infectious disease treatment protocols
- **ACC/AHA**: Cardiovascular disease management
- **ADA**: Diabetes standards of care
- **GINA**: Asthma management guidelines
- **EAU**: Urology guidelines
- **Local Bosnia Protocols**: When available

### Data Security & Compliance

- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Access Control**: Role-based with 2FA
- **Audit Trail**: Immutable logs of all actions
- **GDPR**: Data minimization, consent, right to erasure
- **FHIR R4**: Interoperability standard for EHR integration
- **No Data Selling**: Patient data never shared with third parties

### Hospital Integration

- **FHIR Endpoints**: Patient, MedicationRequest, MedicationStatement
- **HL7 Compatible**: Standard healthcare data exchange
- **Bulk Data Export**: GDPR-compliant patient data portability
- **EHR Integration**: Ready for hospital system integration

## 🧪 Testing

```bash
# Unit tests (backend services, safety engine, rules engine)
npm run test

# Integration tests (API endpoints, database operations)
npm run test:e2e

# Frontend tests (React components, user workflows)
cd apps/web && npm test

# Coverage report
npm run test:coverage

# Seed database with test data
cd apps/backend && npx prisma db seed

# Seed clinical rules (15+ conditions)
cd apps/backend && npx ts-node prisma/seed-clinical-rules.ts
```

**Test Accounts:**
```
Doctor:      doctor@horalix.health      / password123
Nurse:       nurse@horalix.health       / password123
Pharmacist:  pharmacist@horalix.health  / password123
Admin:       admin@horalix.health       / password123
```

**Test Patients** (pre-seeded):
- Amar Begović (National ID: 1234567890123) - Adult with penicillin allergy
- Lejla Hasanović (National ID: 9876543210987) - Pregnant woman
- Tarik Muratović (National ID: 5555555555555) - Pediatric patient (8 years old)

## 📖 API Documentation

Key endpoints:

```
POST /api/auth/login
GET  /api/medications/aware/:category
POST /api/prescriptions/recommendations
POST /api/prescriptions
GET  /api/prescriptions/:id
POST /api/prescriptions/alerts/:id/override
```

Full API docs available at `/api/docs` when running.

## 🌍 Internationalization

- **Bosnian (bs)**: Default
- **English (en)**: Available

Toggle in settings or via `?lang=en` parameter.

## 🚢 Deployment

### Docker

```bash
docker-compose up -d
```

### Production Checklist
- [ ] Secure DATABASE_URL and JWT_SECRET
- [ ] Enable HTTPS/TLS
- [ ] Configure Redis password
- [ ] Set up database backups
- [ ] Enable monitoring
- [ ] Review CORS settings
- [ ] Configure rate limiting

## 📄 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- **WHO AWaRe**: Antibiotic classification
- **Bosnia and Herzegovina**: National drug formulary (2025)
- Open-source community

## 📞 Support

- Issues: GitHub Issues
- Docs: Coming soon

---

**Built for safer prescribing**