import { GeneralExpense, MileageLog, PayStub } from '../../types';

/**
 * Format string field safely for CSV export.
 *
 * @param val - Raw value to sanitize
 * @returns Escaped CSV field
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generate Schedule C General Expenses CSV export.
 *
 * @param expenses - List of general expenses
 * @returns CSV string content
 */
export function generateScheduleCExpensesCsv(expenses: GeneralExpense[]): string {
  const headers = ['Date', 'Payee', 'Category', 'Schedule C Line', 'Description', 'Amount ($)', 'Paid By', 'Deductible?'];
  const rows = expenses.map(exp => [
    escapeCsv(exp.expenseDate),
    escapeCsv(exp.payee),
    escapeCsv(exp.category),
    escapeCsv(exp.scheduleCLine || 'Line 18 - Office Expense'),
    escapeCsv(exp.description),
    escapeCsv(exp.amount.toFixed(2)),
    escapeCsv(exp.paidBy),
    escapeCsv(exp.isTaxDeductible ? 'YES' : 'NO'),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Generate IRS Mileage Log CSV export.
 *
 * @param logs - List of mileage logs
 * @returns CSV string content
 */
export function generateMileageLogCsv(logs: MileageLog[]): string {
  const headers = ['Date', 'Origin', 'Destination', 'Business Purpose', 'Start Odo', 'End Odo', 'Miles', 'IRS Rate ($)', 'Deduction ($)', 'Status'];
  const rows = logs.map(m => [
    escapeCsv(m.tripDate),
    escapeCsv(m.originLocation),
    escapeCsv(m.destinationLocation),
    escapeCsv(m.businessPurpose),
    escapeCsv(m.startOdometer),
    escapeCsv(m.endOdometer),
    escapeCsv(m.calculatedMiles),
    escapeCsv(m.rateApplied.toFixed(3)),
    escapeCsv(m.mileageAllowance.toFixed(2)),
    escapeCsv(m.status),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Generate Payroll Summary CSV export.
 *
 * @param stubs - List of paystubs
 * @returns CSV string content
 */
export function generatePayrollSummaryCsv(stubs: PayStub[]): string {
  const headers = ['Pay Date', 'Period Start', 'Period End', 'Employee ID', 'Gross ($)', 'Fed Tax ($)', 'PA State Tax ($)', 'Social Security ($)', 'Medicare ($)', 'Local EIT ($)', 'Reimbursements ($)', 'Net Pay ($)', 'Company Cost ($)'];
  const rows = stubs.map(s => [
    escapeCsv(s.payDate),
    escapeCsv(s.periodStart),
    escapeCsv(s.periodEnd),
    escapeCsv(s.employeeId),
    escapeCsv(s.grossEarnings.toFixed(2)),
    escapeCsv(s.federalIncomeTax.toFixed(2)),
    escapeCsv((s.paStateTax ?? 0).toFixed(2)),
    escapeCsv(s.socialSecurityTax.toFixed(2)),
    escapeCsv(s.medicareTax.toFixed(2)),
    escapeCsv((s.paLocalEit ?? 0).toFixed(2)),
    escapeCsv(s.totalReimbursements.toFixed(2)),
    escapeCsv(s.netPay.toFixed(2)),
    escapeCsv(s.totalCompanyCost.toFixed(2)),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Helper to download raw text content as a file in browser.
 *
 * @param content - File content
 * @param filename - Name of file to save
 * @param mimeType - MIME type of file
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
