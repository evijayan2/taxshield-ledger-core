import jsPDF from 'jspdf';
import { Organization } from '../types';
import { W2EmployeeSummary, W3TransmittalSummary, formatCurrency } from './w2w3Data';

/**
 * Draws a standard IRS form box with label and formatted vector text value.
 */
function drawBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  val: string
): void {
  doc.setLineWidth(0.5);
  doc.setDrawColor(100, 100, 100);
  doc.rect(x, y, w, h);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(50, 50, 50);
  doc.text(label, x + 4, y + 9);

  if (val) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    const lines = val.split('\n');
    if (lines.length > 1) {
      // Multiline content (e.g. Employer/Employee address blocks)
      // Render text starting below label with tight line height
      let lineY = y + 20;
      for (const line of lines) {
        doc.text(line, x + 4, lineY);
        lineY += 11;
      }
    } else {
      // Single-line value: position near bottom of box
      doc.text(val, x + 4, y + h - 5);
    }
  }
}

/**
 * Draws W-2 Form Header section on a document.
 */
function drawW2Header(doc: jsPDF, copyType: string, year: number = 2026, yOffset: number = 0): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 51, 102);
  doc.text(`Form W-2 Wage and Tax Statement`, 40, 40 + yOffset);

  doc.setFontSize(12);
  doc.setTextColor(180, 0, 0);
  doc.text(`${year}`, 530, 40 + yOffset);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Department of the Treasury—Internal Revenue Service`, 40, 52 + yOffset);
  doc.text(copyType, 510, 52 + yOffset, { align: 'right' });
}

/**
 * Renders employee and employer boxes on a Form W-2 document.
 */
function renderW2Content(doc: jsPDF, w2: W2EmployeeSummary, org: Organization, yOffset: number = 0): void {
  const b = w2.boxes;
  const fmt = formatCurrency;

  // Left column: Identifiers & Addresses
  drawBox(doc, 40, 65 + yOffset, 260, 40, 'a Employee\'s social security number', w2.employeeSsn);
  drawBox(doc, 40, 105 + yOffset, 260, 40, 'b Employer identification number (EIN)', org.ein);
  drawBox(doc, 40, 145 + yOffset, 260, 65, 'c Employer\'s name, address, and ZIP code', `${org.name}\n${org.address}\n${org.city}, ${org.state} ${org.zip}`);
  drawBox(doc, 40, 210 + yOffset, 260, 30, 'd Control number', `CN-${w2.employeeId.slice(0, 8)}`);
  drawBox(doc, 40, 240 + yOffset, 260, 40, 'e Employee\'s first name and initial, last name', w2.employeeName);
  drawBox(doc, 40, 280 + yOffset, 260, 50, 'f Employee\'s address and ZIP code', `${w2.employeeAddress}\n${w2.employeeCityStateZip}`);

  // Right column: Box 1 to 14
  drawBox(doc, 300, 65 + yOffset, 135, 35, '1 Wages, tips, other comp.', fmt(b.box1Wages));
  drawBox(doc, 435, 65 + yOffset, 135, 35, '2 Federal income tax withheld', fmt(b.box2FedTax));
  drawBox(doc, 300, 100 + yOffset, 135, 35, '3 Social security wages', fmt(b.box3SsWages));
  drawBox(doc, 435, 100 + yOffset, 135, 35, '4 Social security tax withheld', fmt(b.box4SsTax));
  drawBox(doc, 300, 135 + yOffset, 135, 35, '5 Medicare wages and tips', fmt(b.box5MedWages));
  drawBox(doc, 435, 135 + yOffset, 135, 35, '6 Medicare tax withheld', fmt(b.box6MedTax));
  drawBox(doc, 300, 170 + yOffset, 135, 35, '7 Social security tips', '$0.00');
  drawBox(doc, 435, 170 + yOffset, 135, 35, '8 Allocated tips', '$0.00');
  drawBox(doc, 300, 205 + yOffset, 135, 35, '9 Verification code', '—');
  drawBox(doc, 435, 205 + yOffset, 135, 35, '10 Dependent care benefits', '$0.00');
  drawBox(doc, 300, 240 + yOffset, 135, 45, '11 Nonqualified plans', '$0.00');
  drawBox(doc, 435, 240 + yOffset, 135, 45, '12a Codes & Amounts', 'DD $0.00');

  // Box 13 Checkboxes
  doc.setLineWidth(0.5);
  doc.setDrawColor(100, 100, 100);
  doc.rect(300, 285 + yOffset, 135, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(50, 50, 50);
  doc.text('13 Statutory emp. / Retire. plan / 3rd-party sick', 303, 293 + yOffset);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  const statBox = b.box13Statutory ? '[X]' : '[  ]';
  const retBox = b.box13RetirementPlan ? '[X]' : '[  ]';
  const sickBox = b.box13ThirdPartySick ? '[X]' : '[  ]';
  doc.text(`${statBox} Stat. ${retBox} Retire. ${sickBox} Sick`, 303, 318 + yOffset);

  // Box 14 Other
  drawBox(doc, 435, 285 + yOffset, 135, 45, '14 Other', b.box14Other);

  // Bottom row: State & Local (Box 15 to 20)
  drawBox(doc, 40, 330 + yOffset, 70, 35, '15 State', b.box15State);
  drawBox(doc, 110, 330 + yOffset, 130, 35, 'Employer\'s state ID', b.box15StateId);
  drawBox(doc, 240, 330 + yOffset, 110, 35, '16 State wages', fmt(b.box16StateWages));
  drawBox(doc, 350, 330 + yOffset, 110, 35, '17 State tax', fmt(b.box17StateTax));
  drawBox(doc, 460, 330 + yOffset, 110, 35, '18 Local wages', fmt(b.box18LocalWages));

  drawBox(doc, 40, 365 + yOffset, 200, 35, '20 Locality name', b.box20Locality);
  drawBox(doc, 240, 365 + yOffset, 330, 35, '19 Local income tax withheld', fmt(b.box19LocalTax));
}

/**
 * Renders Form W-3 Transmittal document header.
 */
function drawW3Header(doc: jsPDF, year: number = 2026): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 51, 102);
  doc.text(`Form W-3 Transmittal of Wage and Tax Statements`, 40, 45);

  doc.setFontSize(14);
  doc.setTextColor(180, 0, 0);
  doc.text(`${year}`, 530, 45);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Department of the Treasury—Internal Revenue Service`, 40, 58);
}

/**
 * Generates an official 3rd party readable Form W-2 PDF document for an employee.
 * @param w2 Employee W-2 summary
 * @param org Organization details
 * @returns jsPDF instance
 */
export function generateW2Pdf(w2: W2EmployeeSummary, org: Organization): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  doc.setProperties({
    title: `${org.name || 'Company'} - Form W-2 (${w2.employeeName}) - 2026`,
    subject: `IRS Form W-2 Wage and Tax Statement for ${w2.employeeName}`,
    author: org.name || 'TaxShield Ledger',
    creator: 'TaxShield Ledger',
  });

  // Copy B (Federal Tax Return)
  drawW2Header(doc, 'Copy B — To Be Filed With Employee\'s FEDERAL Tax Return', 2026, 0);
  renderW2Content(doc, w2, org, 0);

  // Copy C (Employee Record) - 2-up per page
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(40, 415, 570, 415);
  doc.setLineDashPattern([], 0);

  drawW2Header(doc, 'Copy C — For Employee\'s Records', 2026, 380);
  renderW2Content(doc, w2, org, 380);

  return doc;
}

/**
 * Generates an official 3rd party readable Form W-3 Transmittal PDF document.
 * @param w3 W-3 Transmittal summary data
 * @param org Organization details
 * @returns jsPDF instance
 */
export function generateW3Pdf(w3: W3TransmittalSummary, org: Organization): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  doc.setProperties({
    title: `${org.name || 'Company'} - Form W-3 Transmittal - ${w3.taxYear}`,
    subject: 'IRS Form W-3 Transmittal of Wage and Tax Statements',
    author: org.name || 'TaxShield Ledger',
    creator: 'TaxShield Ledger',
  });
  const fmt = formatCurrency;

  drawW3Header(doc, w3.taxYear);

  drawBox(doc, 40, 70, 130, 35, 'b Kind of Payer', w3.kindOfPayer);
  drawBox(doc, 170, 70, 130, 35, 'Total number of Forms W-2', String(w3.totalFormsW2));
  drawBox(doc, 300, 70, 270, 35, 'e Employer identification number (EIN)', w3.employerEin);

  drawBox(doc, 40, 105, 260, 60, 'c Employer\'s name, address, and ZIP code', `${w3.employerName}\n${w3.employerAddress}\n${w3.employerCityStateZip}`);
  drawBox(doc, 300, 105, 270, 60, 'Employer\'s State ID Number', w3.employerStateId || '77-88990');

  drawBox(doc, 40, 175, 265, 40, '1 Wages, tips, other comp.', fmt(w3.totalBox1Wages));
  drawBox(doc, 305, 175, 265, 40, '2 Federal income tax withheld', fmt(w3.totalBox2FedTax));

  drawBox(doc, 40, 215, 265, 40, '3 Social security wages', fmt(w3.totalBox3SsWages));
  drawBox(doc, 305, 215, 265, 40, '4 Social security tax withheld', fmt(w3.totalBox4SsTax));

  drawBox(doc, 40, 255, 265, 40, '5 Medicare wages and tips', fmt(w3.totalBox5MedWages));
  drawBox(doc, 305, 255, 265, 40, '6 Medicare tax withheld', fmt(w3.totalBox6MedTax));

  drawBox(doc, 40, 295, 265, 40, '16 State wages, tips, etc.', fmt(w3.totalBox16StateWages));
  drawBox(doc, 305, 295, 265, 40, '17 State income tax withheld', fmt(w3.totalBox17StateTax));

  drawBox(doc, 40, 335, 265, 40, '18 Local wages, tips, etc.', fmt(w3.totalBox18LocalWages));
  drawBox(doc, 305, 335, 265, 40, '19 Local income tax withheld', fmt(w3.totalBox19LocalTax));

  // Signature Block
  doc.rect(40, 390, 530, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Under penalties of perjury, I declare that I have examined this return...', 45, 402);
  doc.text(`Employer Signature: _______________________   Title: Owner   Date: ${new Date().toLocaleDateString()}`, 45, 435);

  return doc;
}

/**
 * Combines Form W-3 transmittal and all employee Form W-2s into a single multi-page PDF bundle.
 * @param org Organization details
 * @param w2Summaries Array of employee W-2 summaries
 * @param w3Summary W-3 summary data
 * @returns Combined jsPDF instance
 */
export function generateW2W3BundlePdf(
  org: Organization,
  w2Summaries: W2EmployeeSummary[],
  w3Summary: W3TransmittalSummary
): jsPDF {
  const bundleDoc = generateW3Pdf(w3Summary, org);
  bundleDoc.setProperties({
    title: `${org.name || 'Company'} - IRS W-2 and W-3 Tax Package - ${w3Summary.taxYear}`,
    subject: 'IRS Form W-2 and W-3 Wage and Tax Statements Package',
    author: org.name || 'TaxShield Ledger',
    creator: 'TaxShield Ledger',
  });

  w2Summaries.forEach(w2 => {
    bundleDoc.addPage();
    drawW2Header(bundleDoc, 'Copy B — To Be Filed With Employee\'s FEDERAL Tax Return', 2026, 0);
    renderW2Content(bundleDoc, w2, org, 0);

    bundleDoc.setLineWidth(0.5);
    bundleDoc.setLineDashPattern([3, 3], 0);
    bundleDoc.line(40, 415, 570, 415);
    bundleDoc.setLineDashPattern([], 0);

    drawW2Header(bundleDoc, 'Copy C — For Employee\'s Records', 2026, 380);
    renderW2Content(bundleDoc, w2, org, 380);
  });

  return bundleDoc;
}

/**
 * Triggers a browser file download of a generated jsPDF document.
 * @param doc jsPDF document instance
 * @param filename File download name
 */
export function downloadPdfDocument(doc: jsPDF, filename: string): void {
  doc.save(filename);
}
