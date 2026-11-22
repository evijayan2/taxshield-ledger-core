import { describe, it, expect } from 'vitest';
import {
  parseCurrency,
  detectProviderDialect,
  parseCsvRows,
  parseProviderPayrollCsv,
} from './providerPayrollParser';

describe('providerPayrollParser', () => {
  it('parses formatted currency strings accurately with negative support', () => {
    expect(parseCurrency('$1,234.56')).toBe(1234.56);
    expect(parseCurrency(' ($50.25) ')).toBe(-50.25);
    expect(parseCurrency('-120.00')).toBe(-120.0);
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency(undefined)).toBe(0);
  });

  it('detects Gusto dialect from register headers', () => {
    const gustoHeaders = ['Employee', 'Check Date', 'Gross Pay', 'Federal Income Tax', 'Employee FICA', 'Net Pay'];
    expect(detectProviderDialect(gustoHeaders)).toBe('GUSTO');
  });

  it('detects QuickBooks Online dialect from register headers', () => {
    const qboHeaders = ['Employee', 'Pay Date', 'Total Pay', 'Federal Withholding', 'Social Security Employee', 'Net Pay'];
    expect(detectProviderDialect(qboHeaders)).toBe('QUICKBOOKS');
  });

  it('parses CSV lines with embedded commas and quotes properly', () => {
    const csv = 'Employee,Gross Pay,Net Pay\n"Doe, Jane","$1,500.00","$1,200.00"\n"Smith, Bob","$2,000.00","$1,600.00"';
    const { headers, rows } = parseCsvRows(csv);
    expect(headers).toEqual(['Employee', 'Gross Pay', 'Net Pay']);
    expect(rows.length).toBe(2);
    expect(rows[0]['Employee']).toBe('Doe, Jane');
    expect(rows[0]['Gross Pay']).toBe('$1,500.00');
  });

  it('parses Gusto CSV into normalized ProviderPayrollRow objects', () => {
    const gustoCsv = `Employee,Check Date,Period Start,Period End,Gross Pay,Federal Income Tax,Social Security,Medicare,State Tax,Local Tax,Net Pay
"Alice Baker",2026-08-15,2026-08-01,2026-08-15,$3000.00,$350.00,$186.00,$43.50,$92.10,$30.00,$2298.40`;
    const res = parseProviderPayrollCsv(gustoCsv);
    expect(res.provider).toBe('GUSTO');
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];
    expect(row.employeeName).toBe('Alice Baker');
    expect(row.grossWages).toBe(3000);
    expect(row.fitWithheld).toBe(350);
    expect(row.ficaSsWithheld).toBe(186);
    expect(row.ficaMedWithheld).toBe(43.5);
    expect(row.stateWithheld).toBe(92.1);
    expect(row.localWithheld).toBe(30);
    expect(row.netPay).toBe(2298.4);
  });

  it('parses QuickBooks CSV into normalized ProviderPayrollRow objects', () => {
    const qboCsv = `Employee,Pay Date,Pay Period Start,Pay Period End,Total Pay,Federal Withholding,Social Security Employee,Medicare Employee,State Withholding,Net Pay
"Charlie Davis",2026-09-01,2026-08-16,2026-08-31,"$4,000.00",$500.00,$248.00,$58.00,$122.80,"$3,071.20"`;
    const res = parseProviderPayrollCsv(qboCsv);
    expect(res.provider).toBe('QUICKBOOKS');
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].employeeName).toBe('Charlie Davis');
    expect(res.rows[0].grossWages).toBe(4000);
    expect(res.rows[0].netPay).toBe(3071.2);
  });
});
