# Horalix 🏥

> **Hospital-grade drug prescribing platform with built-in antibiotic stewardship and clinical decision support**

Horalix is a comprehensive medication management system designed for healthcare providers in Bosnia and Herzegovina. It combines evidence-based clinical guidelines, WHO AWaRe antibiotic classification, and patient safety checks to support clinicians in making informed prescribing decisions.

## 🌟 Key Features

### Dual-Tier Drug Navigator
- **Antibiotics Tab**: WHO AWaRe classification (Access, Watch, Reserve) for antibiotic stewardship
- **Other Medications Tab**: Complete formulary organized by ATC therapeutic categories
- Real-time search and filtering across 2025 Bosnia national formulary

### Clinical Decision Support
- Evidence-based treatment recommendations based on diagnosis
- Patient-specific dosing (age, weight, renal/hepatic function)
- Explainable AI - every recommendation includes clinical rationale
- Guideline references (WHO, IDSA, local Bosnia protocols)

### Comprehensive Safety Engine
- ✅ **Allergy Checks**: Cross-sensitivity detection (e.g., penicillin → cephalosporins)
- ⚠️ **Drug-Drug Interactions**: Real-time DDI screening with severity grading
- 🚫 **Contraindications**: Patient condition-based warnings
- 📊 **Duplicate Therapy**: Detection of therapeutic overlap
- 💊 **Dose Validation**: Age-appropriate and organ function-adjusted dosing
- 🤰 **Pregnancy/Lactation**: Safety categorization and warnings
- 🧓 **Age-Specific**: Pediatric and geriatric considerations

### Role-Based Access Control
- **Doctors**: Full prescribing with decision support
- **Nurses**: Medication administration tracking and alerts
- **Pharmacists**: Dispensing, substitutions, and formulary management
- **Admins**: Analytics, audit logs, and system configuration

### Compliance & Privacy
- GDPR-compliant data handling
- End-to-end encryption (TLS 1.3)
- Comprehensive audit trail
- Two-factor authentication (2FA)
- Immutable logs for regulatory compliance

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

1. Doctor enters patient diagnosis (e.g., "Community-Acquired Pneumonia")
2. Rules engine matches diagnosis to clinical guidelines
3. System generates recommendations considering:
   - Patient allergies, age, weight, organ function
   - Current medications (interaction checking)
   - WHO AWaRe classification (prefers Access antibiotics)
   - Local resistance patterns
4. Safety engine validates all recommendations
5. Provides primary choice + alternatives with rationale

### Example Recommendation

```
Primary: Amoxicillin 500mg PO TID x 7 days

Rationale:
✓ Access antibiotic (low resistance risk, first-line)
✓ Covers Streptococcus pneumoniae (most common CAP pathogen)
✓ Normal renal function - standard dosing safe
✓ No drug interactions with current medications
✓ Evidence: WHO AWaRe 2023, IDSA CAP Guidelines (Level A)

Alternatives (if needed):
• Azithromycin 500mg PO QD x 5 days (penicillin allergy)
• Levofloxacin 750mg PO QD x 5 days (treatment failure)
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

## 🧪 Testing

```bash
npm run test              # Unit tests
npm run test:e2e          # Integration tests
npm run test:coverage     # Coverage report
```

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