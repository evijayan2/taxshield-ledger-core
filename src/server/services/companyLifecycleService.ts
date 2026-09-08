import { Company, CompanyAddressHistory, Employee, PayStub, ComplianceTask } from '../../types';
import { calculateW2Summaries, W2EmployeeSummary } from '../../utils/w2w3Data';

export interface ActiveCompanyAddress {
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  psdCode?: string;
  localJurisdictionName?: string;
  workEitRate?: number;
}

export interface DissolutionResult {
  company: Company;
  terminatedEmployees: Employee[];
  finalComplianceTasks: ComplianceTask[];
  acceleratedW2Summaries: W2EmployeeSummary[];
}

/**
 * Resolves the company's active physical location and work-site EIT tax rate for a specific date (YYYY-MM-DD).
 */
export function resolveCompanyAddressForDate(
  company: Company,
  history: CompanyAddressHistory[] = [],
  dateStr: string = new Date().toISOString().split('T')[0]
): ActiveCompanyAddress {
  const targetDate = new Date(dateStr);

  const activeRecord = (history || []).find(h => {
    const start = new Date(h.effectiveDate);
    const end = h.endDate ? new Date(h.endDate) : new Date('2099-12-31');
    return start <= targetDate && end >= targetDate;
  });

  if (activeRecord) {
    return {
      streetAddress: activeRecord.streetAddress,
      city: activeRecord.city,
      state: activeRecord.state,
      zip: activeRecord.zip,
      psdCode: activeRecord.psdCode || undefined,
      localJurisdictionName: activeRecord.localJurisdictionName || undefined,
      workEitRate: activeRecord.workEitRate,
    };
  }

  // Fallback to primary company record
  const isPhilly = company.city?.toLowerCase().includes('philadelphia') || company.zip?.startsWith('191');

  return {
    streetAddress: company.address || '',
    city: company.city || '',
    state: company.state || 'PA',
    zip: company.zip || '',
    psdCode: isPhilly ? 'PHILLY' : undefined,
    localJurisdictionName: isPhilly ? 'Philadelphia City Wage Tax' : undefined,
    workEitRate: undefined,
  };
}

/**
 * Executes mid-fiscal-year company dissolution workflow:
 * 1. Sets company status to DISSOLVED with closure date and reason.
 * 2. Inactivates all employees.
 * 3. Tags quarterly tax returns (941, REV-1667, UC-2, Form CL) as FINAL.
 * 4. Compiles accelerated W-2 summaries.
 */
export function dissolveCompanyWorkflow(
  company: Company,
  employees: Employee[],
  payStubs: PayStub[],
  complianceTasks: ComplianceTask[],
  closureDate: string,
  closureReason: string = 'Business Dissolution'
): DissolutionResult {
  const updatedCompany: Company = {
    ...company,
    status: 'DISSOLVED',
    closedAt: closureDate,
    closureReason,
  };

  const terminatedEmployees: Employee[] = employees.map(emp => ({
    ...emp,
    isActive: false,
  }));

  const finalComplianceTasks: ComplianceTask[] = complianceTasks.map(task => {
    const updatedBoxValues = { ...task.boxValues };

    if (task.formIdentifier === 'FORM_941') {
      updatedBoxValues['box17_final_return'] = {
        label: '17. Final return (Business closed)',
        value: `YES - Closed ${closureDate}`,
      };
    } else if (task.formIdentifier === 'REV_1667' || task.formIdentifier === 'PA_LOCAL_EIT' || task.formIdentifier === 'PA_UC_2') {
      updatedBoxValues['final_return_flag'] = {
        label: 'Final Return / Close Account',
        value: `CLOSED ON ${closureDate}`,
      };
    }

    return {
      ...task,
      boxValues: updatedBoxValues,
      notes: `${task.notes ? task.notes + ' | ' : ''}FINAL RETURN - Business closed on ${closureDate}. Reason: ${closureReason}`,
    };
  });

  const year = new Date(closureDate).getFullYear();
  const acceleratedW2Summaries = calculateW2Summaries(company, terminatedEmployees, payStubs, year);

  return {
    company: updatedCompany,
    terminatedEmployees,
    finalComplianceTasks,
    acceleratedW2Summaries,
  };
}
