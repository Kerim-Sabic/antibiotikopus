# Contributing to Horalix

Thank you for your interest in contributing to Horalix! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Clinical Accuracy](#clinical-accuracy)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of background or identity.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community and patients
- Show empathy towards other community members

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/horalix.git
   cd horalix
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-org/horalix.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Set up your development environment** following the README

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Write clean, readable code
- Follow the coding standards (see below)
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:backend
npm run test:frontend

# Run linter
npm run lint

# Type checking
npm run type-check
```

### 4. Commit Your Changes

Follow the [Commit Guidelines](#commit-guidelines) below.

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Standards

### TypeScript

- **Strict mode**: Always use TypeScript strict mode
- **Types**: Prefer interfaces over types for object shapes
- **No `any`**: Avoid using `any` type; use `unknown` if type is truly unknown
- **Null safety**: Handle null/undefined cases explicitly

```typescript
// Good
interface Patient {
  id: string;
  name: string;
  dateOfBirth: Date;
}

// Avoid
type Patient = any;
```

### Naming Conventions

- **Variables/Functions**: camelCase (`patientId`, `getMedication`)
- **Classes/Interfaces**: PascalCase (`SafetyEngine`, `Prescription`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_DOSE`, `API_URL`)
- **Files**: kebab-case for components (`safety-alerts-panel.tsx`)

### Code Style

- **Indentation**: 2 spaces
- **Semicolons**: Required
- **Quotes**: Single quotes for TS/JS, double quotes for JSX attributes
- **Line length**: Max 100 characters (use Prettier)

### React/Next.js

- **Functional Components**: Always use functional components with hooks
- **Props**: Define interface for component props
- **Hooks**: Follow Rules of Hooks
- **Performance**: Use `useMemo`/`useCallback` for expensive operations

```typescript
interface DrugCardProps {
  medication: Medication;
  onSelect: (id: string) => void;
}

export function DrugCard({ medication, onSelect }: DrugCardProps) {
  const handleClick = useCallback(() => {
    onSelect(medication.id);
  }, [medication.id, onSelect]);

  return <div onClick={handleClick}>...</div>;
}
```

### Backend (NestJS)

- **Modules**: One feature per module
- **Services**: Business logic in services, not controllers
- **DTOs**: Use class-validator for validation
- **Error Handling**: Use proper HTTP exceptions

```typescript
@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private rulesEngine: RulesEngineService,
    private safetyEngine: SafetyEngineService,
  ) {}

  async create(dto: CreatePrescriptionDto) {
    // Validate
    // Apply business logic
    // Return result
  }
}
```

## Testing

### Test Coverage Requirements

- **Minimum coverage**: 80% for new code
- **Critical paths**: 100% coverage for safety-critical features
  - Safety engine
  - Rules engine
  - Drug interactions
  - Allergy checks

### Writing Tests

#### Unit Tests

```typescript
describe('SafetyEngine', () => {
  it('should detect penicillin allergy', async () => {
    const patientContext = {
      allergies: [{ allergen: 'Penicillin', severity: 'SEVERE' }],
    };

    const result = await safetyEngine.checkAllergies(
      patientContext,
      [amoxicillinMedication]
    );

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].type).toBe(AlertType.ALLERGY);
  });
});
```

#### Integration Tests

```typescript
describe('Prescriptions API', () => {
  it('POST /api/prescriptions should create prescription with safety checks', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/prescriptions')
      .send(prescriptionDto)
      .expect(201);

    expect(response.body.alerts).toBeDefined();
  });
});
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(safety-engine): add hepatic dose adjustment warnings

Implement automatic dose adjustment warnings for medications
metabolized by the liver when patient has hepatic impairment.

Closes #123
```

```
fix(prescriptions): prevent duplicate medication entries

Fixed bug where same medication could be added multiple times
to a single prescription.

Fixes #456
```

### Commit Best Practices

- One logical change per commit
- Write clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits atomic and focused

## Pull Request Process

### Before Submitting

- [ ] Tests pass locally (`npm test`)
- [ ] Code lints without errors (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Documentation updated (if needed)
- [ ] Changelog updated (for significant changes)

### PR Title

Follow the same format as commit messages:
```
feat(component): brief description
```

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested your changes.

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Follows code style guidelines

## Screenshots (if applicable)
Add screenshots for UI changes.

## Related Issues
Closes #123
```

### Review Process

1. At least one maintainer must approve
2. All CI checks must pass
3. No unresolved conversations
4. Up-to-date with base branch

## Clinical Accuracy

### Medical Content

**CRITICAL**: Horalix is a medical application. All clinical content must be:

1. **Evidence-based**: Reference authoritative sources
   - WHO guidelines
   - IDSA recommendations
   - EMA/FDA approvals
   - Peer-reviewed literature

2. **Verified**: Medical content must be reviewed by healthcare professionals

3. **Up-to-date**: Regular updates to reflect current guidelines

### Adding Clinical Rules

When adding new clinical decision support rules:

```typescript
{
  "name": "Condition Name",
  "diagnosisCodes": ["ICD-10 codes"],
  "firstLineChoice": {
    // Must reference current guidelines
  },
  "guidelineSource": "WHO 2024, IDSA 2023",  // Required
  "evidenceLevel": "A",  // A, B, C based on GRADE
}
```

**Documentation Required:**
- Guideline reference (with year)
- Evidence level
- Any regional variations
- Contraindications
- Special populations (pediatric, geriatric, pregnancy)

### Drug Interactions

- Use established databases (DDInter, DrugBank, etc.)
- Include severity grading
- Provide clinical management recommendations
- Cite sources

### Testing Clinical Logic

All clinical decision support features require:
- Unit tests with edge cases
- Integration tests
- Manual clinical review
- Documentation of test scenarios

## Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Email: security@horalix.health

We will respond within 48 hours.

### Security Best Practices

- Never commit secrets or credentials
- Use environment variables for sensitive data
- Validate all user input
- Follow OWASP guidelines
- Implement proper authentication/authorization

## Documentation

### Code Documentation

```typescript
/**
 * Checks patient allergies against proposed medications
 *
 * @param patientContext - Patient data including allergies
 * @param medications - Proposed medications to check
 * @returns Array of allergy alerts with severity and recommendations
 *
 * @example
 * const alerts = await checkAllergies(patient, [amoxicillin]);
 * if (alerts.find(a => a.severity === 'CRITICAL')) {
 *   // Handle critical allergy
 * }
 */
async checkAllergies(
  patientContext: PatientContext,
  medications: Medication[]
): Promise<SafetyAlert[]> {
  // Implementation
}
```

### README Updates

Update README when:
- Adding new features
- Changing installation process
- Updating dependencies
- Changing API endpoints

## Questions?

- Open a [Discussion](https://github.com/org/horalix/discussions)
- Ask in our [Community Forum](https://community.horalix.health)
- Email: contribute@horalix.health

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Horalix and helping improve healthcare! 🏥
