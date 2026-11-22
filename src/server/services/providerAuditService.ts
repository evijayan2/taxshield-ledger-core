/**
 * Core Provider Audit Variance Service.
 * Recomputes withholdings against TaxShield sealed statutory rules and detects discrepancies.
 */
import type { Employee, CompanyTaxSetting } from '../../types';
import type {
  ProviderPayrollRow,
  AuditComparisonResult,
  AuditVarianceLine,
  ProviderAuditReport,
  ProviderType,
  AuditLineStatus,
} from '../../providerAuditTypes';
import { calculateGrossToNet } from '../../utils/taxEngine';
import { resolveSutaRate } from './sutaExperienceService';

function classifyDelta(
  providerVal: number,
  calcVal: number,
  fieldName: string,
  displayName: string
): AuditVarianceLine {
  const delta = Math.round((providerVal - calcVal) * 100) / 100;
  const absDelta = Math.abs(delta);
  if (absDelta === 0) {
    return {
      fieldName,
      displayName,
      providerValue: providerVal,
      taxShieldValue: calcVal,
      delta: 0,
      category: 'MATCH',
      explanation: 'Exact match with statutory calculation.',
    };
  }
  if (absDelta <= 0.05) {
    return {
      fieldName,
      displayName,
      providerValue: providerVal,
      taxShieldValue: calcVal,
      delta,
      category: 'ROUNDING_DRIFT',
      explanation: `Acceptable rounding variance of $${absDelta.toFixed(2)}.`,
    };
  }
  return {
    fieldName,
    displayName,
    providerValue: providerVal,
    taxShieldValue: calcVal,
    delta,
    category: 'TAX_MISCALCULATION',
    explanation: `Statutory calculation mismatch of $${absDelta.toFixed(2)}.`,
  };
}

function checkSCorpHealth(providerRow: ProviderPayrollRow, employee: Employee): AuditVarianceLine | null {
  const isShareholder = Boolean(employee.isShareholderGreaterThan2Pct || employee.isTwoPercentShareholder);
  if (!isShareholder || !providerRow.sCorpHealth || providerRow.sCorpHealth <= 0) {
    return null;
  }
  const expectedSs = Math.round(providerRow.grossWages * 0.062 * 100) / 100;
  const overwithheldSs = providerRow.ficaSsWithheld > expectedSs;
  if (overwithheldSs) {
    return {
      fieldName: 'sCorpHealth',
      displayName: 'IRC § 1372 S-Corp Shareholder Health Insurance',
      providerValue: providerRow.ficaSsWithheld,
      taxShieldValue: expectedSs,
      delta: Math.round((providerRow.ficaSsWithheld - expectedSs) * 100) / 100,
      category: 'S_CORP_HEALTH_ERROR',
      explanation:
        'Provider erroneously withheld FICA on >2% S-Corp shareholder health insurance. Under IRC § 1372, shareholder health premiums are taxable for FIT but fully exempt from Social Security and Medicare.',
      statutoryCitation: 'IRC § 1372 / IRS Notice 2008-1',
    };
  }
  return null;
}

function checkSutaRate(providerRow: ProviderPayrollRow, settings?: CompanyTaxSetting[]): AuditVarianceLine | null {
  if (!providerRow.employerSuta || providerRow.employerSuta <= 0) return null;
  const resolved = resolveSutaRate({
    stateCode: 'PA',
    companyTaxSettings: settings,
    effectiveDate: new Date(providerRow.checkDate),
  });
  const expectedSuta = Math.round(providerRow.grossWages * resolved.rate * 100) / 100;
  const delta = Math.round((providerRow.employerSuta - expectedSuta) * 100) / 100;
  if (Math.abs(delta) > 0.05) {
    return {
      fieldName: 'employerSuta',
      displayName: 'State Unemployment (SUTA / SUI)',
      providerValue: providerRow.employerSuta,
      taxShieldValue: expectedSuta,
      delta,
      category: 'SUTA_RATE_MISMATCH',
      explanation: `Provider SUTA applied rate does not match company assigned rate (${(resolved.rate * 100).toFixed(3)}%).`,
      statutoryCitation: 'PA UC Law / 43 P.S. § 781',
    };
  }
  return null;
}

function computeStatus(variances: AuditVarianceLine[]): AuditLineStatus {
  if (variances.some((v) => v.category === 'S_CORP_HEALTH_ERROR' || v.category === 'TAX_MISCALCULATION' || v.category === 'SUTA_RATE_MISMATCH')) {
    return 'CRITICAL_DISCREPANCY';
  }
  if (variances.some((v) => v.category === 'ROUNDING_DRIFT' || v.category === 'MISSING_DATA')) {
    return 'WARNING';
  }
  return 'CLEAN';
}

export function compareProviderRow(
  providerRow: ProviderPayrollRow,
  employee?: Employee,
  settings?: CompanyTaxSetting[]
): AuditComparisonResult {
  if (!employee) {
    return {
      employeeName: providerRow.employeeName,
      periodStart: providerRow.periodStart,
      periodEnd: providerRow.periodEnd,
      checkDate: providerRow.checkDate,
      status: 'WARNING',
      providerRow,
      variances: [
        {
          fieldName: 'employee',
          displayName: 'Employee Record Match',
          providerValue: 0,
          taxShieldValue: 0,
          delta: 0,
          category: 'MISSING_DATA',
          explanation: `Employee "${providerRow.employeeName}" does not exist in company roster.`,
        },
      ],
      explanation: 'Unmatched employee record.',
    };
  }

  const effectiveHours = employee.payRate > 0 ? providerRow.grossWages / employee.payRate : 40;
  const calc = calculateGrossToNet(
    employee,
    effectiveHours,
    0,
    0,
    0,
    [],
    providerRow.periodStart,
    providerRow.periodEnd,
    [],
    new Date(providerRow.checkDate),
    undefined,
    settings
  );

  const variances: AuditVarianceLine[] = [
    classifyDelta(providerRow.fitWithheld, calc.federalIncomeTax, 'fit', 'Federal Income Tax (FIT)'),
    classifyDelta(providerRow.ficaSsWithheld, calc.socialSecurityTax, 'ficaSs', 'Social Security (FICA-SS)'),
    classifyDelta(providerRow.ficaMedWithheld, calc.medicareTax, 'ficaMed', 'Medicare (FICA-MED)'),
    classifyDelta(providerRow.stateWithheld, calc.stateIncomeTax, 'stateTax', 'State Income Tax'),
    classifyDelta(providerRow.netPay, calc.netPay, 'netPay', 'Net Pay'),
  ];

  const sCorpVar = checkSCorpHealth(providerRow, employee);
  if (sCorpVar) variances.push(sCorpVar);

  const sutaVar = checkSutaRate(providerRow, settings);
  if (sutaVar) variances.push(sutaVar);

  const status = computeStatus(variances);
  return {
    employeeName: providerRow.employeeName,
    employeeId: employee.id,
    periodStart: providerRow.periodStart,
    periodEnd: providerRow.periodEnd,
    checkDate: providerRow.checkDate,
    status,
    providerRow,
    taxShieldCalculated: {
      grossEarnings: calc.grossEarnings || 0,
      fit: calc.federalIncomeTax || 0,
      ss: calc.socialSecurityTax || 0,
      med: calc.medicareTax || 0,
      sit: calc.stateIncomeTax || 0,
      eit: calc.localIncomeTax || 0,
      suta: calc.employerStateUnemployment || 0,
      netPay: calc.netPay || 0,
    },
    variances,
    explanation: status === 'CLEAN' ? 'Fully verified against TaxShield sealed rules.' : 'Discrepancies identified.',
  };
}

export function generateProviderAuditReport(
  companyId: string,
  rows: ProviderPayrollRow[],
  employees: Employee[],
  settings?: CompanyTaxSetting[],
  provider: ProviderType = 'GENERIC'
): ProviderAuditReport {
  const comparisons = rows.map((r) => {
    const match = employees.find(
      (e) =>
        e.firstName.toLowerCase() + ' ' + e.lastName.toLowerCase() === r.employeeName.toLowerCase() ||
        (r.ssnLast4 && e.ssnLastFour === r.ssnLast4)
    );
    return compareProviderRow(r, match, settings);
  });

  const cleanCount = comparisons.filter((c) => c.status === 'CLEAN').length;
  const warningCount = comparisons.filter((c) => c.status === 'WARNING').length;
  const criticalCount = comparisons.filter((c) => c.status === 'CRITICAL_DISCREPANCY').length;

  const totalGross = rows.reduce((s, r) => s + r.grossWages, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPay, 0);
  const totalProviderTaxes = rows.reduce(
    (s, r) => s + r.fitWithheld + r.ficaSsWithheld + r.ficaMedWithheld + r.stateWithheld + r.localWithheld,
    0
  );
  const totalTaxShieldTaxes = comparisons.reduce(
    (s, c) =>
      s +
      (c.taxShieldCalculated
        ? c.taxShieldCalculated.fit +
          c.taxShieldCalculated.ss +
          c.taxShieldCalculated.med +
          c.taxShieldCalculated.sit +
          c.taxShieldCalculated.eit
        : 0),
    0
  );

  return {
    id: `audit_${Date.now()}`,
    companyId,
    provider,
    analyzedAt: new Date().toISOString(),
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    totalProviderTaxes: Math.round(totalProviderTaxes * 100) / 100,
    totalTaxShieldTaxes: Math.round(totalTaxShieldTaxes * 100) / 100,
    totalVariance: Math.round(Math.abs(totalProviderTaxes - totalTaxShieldTaxes) * 100) / 100,
    cleanCount,
    warningCount,
    criticalCount,
    comparisons,
    summaryExplanation: `${rows.length} rows audited: ${cleanCount} clean, ${warningCount} warnings, ${criticalCount} critical.`,
  };
}
