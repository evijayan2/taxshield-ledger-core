import jsPDF from 'jspdf';
import { Employee, Organization, PayStub } from '../types';

/**
 * Formats a numeric value into USD currency format (e.g. $1,234.56).
 */
function fmtCurr(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Helper to draw a shaded box with header title and border.
 */
function drawHeaderBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  bgR = 245,
  bgG = 247,
  bgB = 250
): void {
  // Fill background
  doc.setFillColor(bgR, bgG, bgB);
  doc.rect(x, y, w, h, 'F');

  // Draw border
  doc.setLineWidth(0.75);
  doc.setDrawColor(210, 215, 225);
  doc.rect(x, y, w, h, 'S');

  // Title bar background
  doc.setFillColor(230, 235, 245);
  doc.rect(x, y, w, 18, 'F');
  doc.line(x, y + 18, x + w, y + 18);

  // Title text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(50, 65, 85);
  doc.text(title.toUpperCase(), x + 8, y + 12);
}

/**
 * Generates an official, PA & IRS compliant itemized Pay Stub PDF document.
 * @param stub Pay stub details
 * @param employee Employee profile
 * @param org Organization profile
 * @returns jsPDF document object
 */
export function generatePayStubPdf(
  stub: PayStub,
  employee: Employee,
  org: Organization
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth(); // 612 pt
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 532 pt

  // ==========================================
  // TOP HEADER & COMPANY / STATEMENT META
  // ==========================================
  doc.setFillColor(15, 23, 42); // Dark slate header banner
  doc.rect(margin, 35, contentWidth, 54, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(org.name || 'Organization Name', margin + 14, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const addrStr = `${org.address || ''}, ${org.city || ''}, ${org.state || 'PA'} ${org.zip || ''}`;
  doc.text(addrStr, margin + 14, 72);

  // Statement badge on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129); // Emerald accent
  doc.text('OFFICIAL EARNINGS STATEMENT', margin + contentWidth - 14, 56, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Pay Date: ${stub.payDate}  |  Period: ${stub.periodStart} to ${stub.periodEnd}`, margin + contentWidth - 14, 72, { align: 'right' });

  let y = 100;

  // ==========================================
  // EMPLOYER & EMPLOYEE DETAILS BOXES
  // ==========================================
  const colW = (contentWidth - 12) / 2; // 260 pt each

  // Employer Info Box
  drawHeaderBox(doc, margin, y, colW, 90, 'Employer & Tax Identification');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.text('Employer Name:', margin + 8, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(org.name, margin + 85, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.text('Federal EIN:', margin + 8, y + 46);
  doc.setFont('helvetica', 'normal');
  doc.text(org.ein || 'N/A', margin + 85, y + 46);

  doc.setFont('helvetica', 'bold');
  doc.text('State Tax ID:', margin + 8, y + 60);
  doc.setFont('helvetica', 'normal');
  doc.text(`${org.stateTaxId || 'N/A'} (${org.state || 'PA'})`, margin + 85, y + 60);

  doc.setFont('helvetica', 'bold');
  doc.text('Pay Frequency:', margin + 8, y + 74);
  doc.setFont('helvetica', 'normal');
  doc.text(org.payFrequency ? org.payFrequency.replace('_', '-') : 'BI-WEEKLY', margin + 85, y + 74);

  // Employee Info Box
  const empX = margin + colW + 12;
  drawHeaderBox(doc, empX, y, colW, 90, 'Employee & Tax Profile');
  doc.setFontSize(8.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Employee Name:', empX + 8, y + 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${employee.firstName} ${employee.lastName}`, empX + 85, y + 32);

  doc.setFont('helvetica', 'bold');
  doc.text('SSN (Last 4):', empX + 8, y + 46);
  doc.setFont('helvetica', 'normal');
  doc.text(`***-**-${employee.ssnLastFour || '****'}`, empX + 85, y + 46);

  doc.setFont('helvetica', 'bold');
  doc.text('W-4 Status:', empX + 8, y + 60);
  doc.setFont('helvetica', 'normal');
  const w4Text = employee.w4FilingStatus ? employee.w4FilingStatus.replace(/_/g, ' ') : 'SINGLE';
  doc.text(w4Text + (employee.w4ExtraWithholding ? ` (+$${employee.w4ExtraWithholding}/pay)` : ''), empX + 85, y + 60);

  const empState = stub.stateCode || employee.state || org.state || 'PA';
  const locName = stub.localityName || employee.localTaxJurisdictionName || employee.paPsdName || 'State Tax Resident';

  doc.setFont('helvetica', 'bold');
  doc.text('State / Locality:', empX + 8, y + 74);
  doc.setFont('helvetica', 'normal');
  doc.text(`${empState} - ${locName}`, empX + 85, y + 74);

  y += 102;

  // Disbursement note line
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 20, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 20, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const bankDesc = employee.bankName ? `${employee.bankName} (${employee.accountType === 'SAVINGS' ? 'Savings' : 'Checking'} ${employee.bankAccountMasked || ''})` : 'ACH Direct Deposit Account';
  doc.text(`Payment Method: Direct Deposit (${stub.disbursementMethod || 'ACH'}) — ${bankDesc}`, margin + 8, y + 13);

  y += 28;

  // ==========================================
  // EARNINGS & HOURS TABLE
  // ==========================================
  drawHeaderBox(doc, margin, y, contentWidth, 75, 'Earnings & Hours Worked');

  // Table columns
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Earnings Description', margin + 10, y + 32);
  doc.text('Hours', margin + 260, y + 32, { align: 'right' });
  doc.text('Hourly Rate', margin + 370, y + 32, { align: 'right' });
  doc.text('Gross Amount', margin + contentWidth - 10, y + 32, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 8, y + 36, margin + contentWidth - 8, y + 36);

  // Regular Base Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Regular Base Wages', margin + 10, y + 50);
  doc.setFont('courier', 'normal');
  doc.text(stub.hoursWorked.toFixed(2), margin + 260, y + 50, { align: 'right' });
  doc.text(fmtCurr(stub.hourlyRate), margin + 370, y + 50, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.text(fmtCurr(stub.grossEarnings), margin + contentWidth - 10, y + 50, { align: 'right' });

  // Overtime Row (if applicable)
  if (stub.overtimeHours > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('Overtime Wages (1.5x)', margin + 10, y + 64);
    doc.setFont('courier', 'normal');
    doc.text(stub.overtimeHours.toFixed(2), margin + 260, y + 64, { align: 'right' });
    doc.text(fmtCurr(stub.hourlyRate * 1.5), margin + 370, y + 64, { align: 'right' });
    doc.setFont('courier', 'bold');
    const otGross = stub.overtimeHours * stub.hourlyRate * 1.5;
    doc.text(fmtCurr(otGross), margin + contentWidth - 10, y + 64, { align: 'right' });
  }

  y += 85;

  // ==========================================
  // STATUTORY TAX DEDUCTIONS (EMPLOYEE)
  // ==========================================
  drawHeaderBox(doc, margin, y, contentWidth, 115, 'Statutory Tax Deductions (Employee Withholding)');

  const taxColW = (contentWidth - 16) / 3;

  const stateIncVal = stub.stateIncomeTax ?? stub.paStateTax ?? 0;
  const localIncVal = stub.localIncomeTax ?? stub.paLocalEit ?? 0;
  const localFlatVal = stub.localFlatTax ?? stub.paLst ?? 0;
  const stateLabel = empState === 'DE' ? 'DE State Income Tax' : `${empState} State Tax`;
  const localLabel = locName ? `${locName} Local Tax` : 'Local Tax';
  const flatLabel = empState === 'PA' ? 'PA Local LST' : 'Local Flat Tax';

  const taxes = [
    { label: 'Federal Income Tax', val: stub.federalIncomeTax },
    { label: 'Social Security (6.2%)', val: stub.socialSecurityTax },
    { label: 'Medicare (1.45%)', val: stub.medicareTax },
    { label: stateLabel, val: stateIncVal },
    { label: localLabel, val: localIncVal },
    { label: flatLabel, val: localFlatVal },
  ];

  taxes.forEach((t, idx) => {
    const r = Math.floor(idx / 3);
    const c = idx % 3;
    const boxX = margin + 6 + c * (taxColW + 2);
    const boxY = y + 25 + r * 26;

    doc.setFillColor(255, 255, 255);
    doc.rect(boxX, boxY, taxColW - 4, 22, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(boxX, boxY, taxColW - 4, 22, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(t.label, boxX + 6, boxY + 14);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(fmtCurr(t.val), boxX + taxColW - 10, boxY + 14, { align: 'right' });
  });

  // Total Employee Tax Summary Bar
  doc.setFillColor(254, 242, 242); // Rose tint
  doc.rect(margin + 6, y + 83, contentWidth - 12, 22, 'F');
  doc.setDrawColor(254, 202, 202);
  doc.rect(margin + 6, y + 83, contentWidth - 12, 22, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(153, 27, 27);
  doc.text('TOTAL STATUTORY TAXES WITHHELD:', margin + 12, y + 97);

  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.text(`-${fmtCurr(stub.totalEmployeeTaxes)}`, margin + contentWidth - 14, y + 97, { align: 'right' });

  y += 125;

  // ==========================================
  // ACCOUNTABLE PLAN REIMBURSEMENTS (IF ANY)
  // ==========================================
  if (stub.totalReimbursements > 0) {
    drawHeaderBox(doc, margin, y, contentWidth, 65, 'Accountable Plan Non-Taxable Reimbursements', 236, 253, 245);

    const reimbs = [];
    if (stub.mileageReimbursement > 0) {
      reimbs.push({ label: 'IRS 5-Point Vehicle Mileage Reimbursement', val: stub.mileageReimbursement });
    }
    if (stub.travelExpensesReimbursement > 0) {
      reimbs.push({ label: 'Business Travel Expenses (Tolls & Parking)', val: stub.travelExpensesReimbursement });
    }

    reimbs.forEach((r, idx) => {
      const boxY = y + 25 + idx * 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(21, 128, 61);
      doc.text(`+ ${r.label}`, margin + 10, boxY + 10);

      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.text(`+${fmtCurr(r.val)}`, margin + contentWidth - 10, boxY + 10, { align: 'right' });
    });

    y += 73;
  }

  // ==========================================
  // NET TAKE-HOME PAY SUMMARY BANNER
  // ==========================================
  doc.setFillColor(16, 185, 129); // Vibrant emerald header box
  doc.rect(margin, y, contentWidth, 54, 'F');
  doc.setDrawColor(5, 150, 105);
  doc.rect(margin, y, contentWidth, 54, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('NET TAKE-HOME PAY (DIRECT DEPOSIT)', margin + 14, y + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(236, 253, 245);
  doc.text(`Formula: (Gross ${fmtCurr(stub.grossEarnings)} - Taxes ${fmtCurr(stub.totalEmployeeTaxes)}) + Reimbursements ${fmtCurr(stub.totalReimbursements)}`, margin + 14, y + 40);

  doc.setFont('courier', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(fmtCurr(stub.netPay), margin + contentWidth - 14, y + 30, { align: 'right' });

  if (stub.achTraceRef) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(209, 250, 229);
    doc.text(`ACH Ref: ${stub.achTraceRef}`, margin + contentWidth - 14, y + 44, { align: 'right' });
  }

  y += 64;

  // ==========================================
  // EMPLOYER TAX MATCH & LLC COST (INFORMATIONAL)
  // ==========================================
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 32, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 32, 'S');

  const sutaLabel = empState === 'DE' ? 'DE SUTA' : `${empState} UC`;
  const sutaVal = stub.employerStateUnemployment ?? stub.employerPaUc ?? 0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Employer Match: Social Security ${fmtCurr(stub.employerSocialSecurity)} | Medicare ${fmtCurr(stub.employerMedicare)} | ${sutaLabel} ${fmtCurr(sutaVal)}`,
    margin + 10,
    y + 19
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`Total LLC Cost for Employee: ${fmtCurr(stub.totalCompanyCost)}`, margin + contentWidth - 10, y + 19, { align: 'right' });

  y += 42;

  // ==========================================
  // FOOTER & AUDIT TRAIL
  // ==========================================
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, margin + contentWidth, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`TaxShield Ledger • Record ID: ${stub.id} • IRS & PA Department of Revenue Compliant Audit Trail`, margin, y + 12);
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin + contentWidth, y + 12, { align: 'right' });

  return doc;
}

/**
 * Generates the Pay Stub PDF document and triggers the browser print window directly.
 * Does NOT render on-screen HTML components.
 */
export function printPayStubPdf(
  stub: PayStub,
  employee: Employee,
  org: Organization
): void {
  const doc = generatePayStubPdf(stub, employee, org);
  
  doc.autoPrint();

  if (typeof document === 'undefined') {
    return;
  }

  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);

  // Attempt silent print via temporary invisible iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      // Fallback if browser blocks iframe print: open blob URL in window for print
      const printWin = window.open(blobUrl, '_blank');
      if (printWin) {
        printWin.focus();
      }
    }
  };
}

/**
 * Generates the Pay Stub PDF document and initiates file download directly.
 */
export function savePayStubPdf(
  stub: PayStub,
  employee: Employee,
  org: Organization
): void {
  const doc = generatePayStubPdf(stub, employee, org);
  const cleanName = `${employee.lastName}_${employee.firstName}_PayStub_${stub.payDate}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${cleanName}.pdf`);
}
