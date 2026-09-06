import { getPool, initPostgresTables } from './db.js';

export async function loadAllDataFromPostgres(): Promise<any | null> {
  const pool = getPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    // 1. Concurrently fetch company profile and latest state snapshot
    const [compRes, snapRes] = await Promise.all([
      client.query('SELECT * FROM companies LIMIT 1').catch(() => ({ rows: [] })),
      client.query('SELECT data FROM app_state_snapshots WHERE id = $1', ['current_state']).catch(() => ({ rows: [] }))
    ]);

    let org: any = null;
    if (compRes.rows.length > 0) {
      const cRow = compRes.rows[0];
      const stateTaxId = cRow.statetaxid ?? cRow.state_tax_id ?? cRow.stateTaxId ?? '';
      const ownerName = cRow.ownername ?? cRow.owner_name ?? cRow.ownerName ?? '';
      const ownerEmail = cRow.owneremail ?? cRow.owner_email ?? cRow.ownerEmail ?? '';
      const rawBracket = cRow.ownertaxbracket ?? cRow.owner_tax_bracket ?? cRow.ownerTaxBracket ?? 24;
      const stateFilingFreq = cRow.statefilingfrequency ?? cRow.state_filing_frequency ?? cRow.stateFilingFrequency ?? cRow.filingFrequencyPa ?? 'MONTHLY';
      const payFreq = cRow.payfrequency ?? cRow.pay_frequency ?? cRow.payFrequency ?? 'BI_WEEKLY';
      const rawMileage = cRow.standardmileagerate ?? cRow.standard_mileage_rate ?? cRow.standardMileageRate ?? 0.67;

      org = {
        id: cRow.id,
        name: cRow.name || '',
        ein: cRow.ein || '',
        stateTaxId: stateTaxId || '',
        address: cRow.address || '',
        city: cRow.city || '',
        state: cRow.state || 'PA',
        zip: cRow.zip || '',
        ownerName: ownerName || '',
        ownerEmail: ownerEmail || '',
        ownerTaxBracket: typeof rawBracket === 'number' ? rawBracket : (parseFloat(rawBracket) || 24),
        stateFilingFrequency: stateFilingFreq || 'MONTHLY',
        filingFrequencyPA: stateFilingFreq || 'MONTHLY',
        payFrequency: payFreq || 'BI_WEEKLY',
        standardMileageRate: typeof rawMileage === 'number' ? rawMileage : (parseFloat(rawMileage) || 0.67),
      };
    } else {
      org = {
        id: 'comp_main',
        name: '',
        ein: '',
        stateTaxId: '',
        address: '',
        city: '',
        state: 'PA',
        zip: '',
        ownerName: '',
        ownerEmail: '',
        ownerTaxBracket: 24,
        stateFilingFrequency: 'MONTHLY',
        filingFrequencyPA: 'MONTHLY',
        payFrequency: 'BI_WEEKLY',
        standardMileageRate: 0.67,
      };
    }

    // Fast path: Check if snapshot exists and return immediately
    if (snapRes.rows.length > 0 && snapRes.rows[0].data) {
      const snapData = snapRes.rows[0].data;
      if (org && org.name && org.ein) {
        snapData.org = { ...snapData.org, ...org };
        snapData.company = snapData.org;
      }
      return snapData;
    }

    // Fallback: Concurrently fetch all normalized relational tables
    const [
      empRes,
      milRes,
      trvRes,
      runRes,
      stubRes,
      taskRes,
      genRes,
      tsRes,
      auditRes,
      tyRes,
    ] = await Promise.all([
      client.query('SELECT * FROM employees ORDER BY first_name ASC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM mileage_logs ORDER BY trip_date DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM travel_expenses ORDER BY expense_date DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM payroll_runs ORDER BY period_end DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM pay_stubs ORDER BY pay_date DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM compliance_tasks ORDER BY due_date ASC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM general_expenses ORDER BY expense_date DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM timesheets ORDER BY work_date DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM audit_log_entries ORDER BY timestamp DESC').catch(() => ({ rows: [] })),
      client.query('SELECT * FROM tax_years ORDER BY year DESC').catch(() => ({ rows: [] })),
    ]);

    const employees = empRes.rows.map(e => {
      const locCode = e.local_tax_jurisdiction_code || e.pa_psd_code || undefined;
      const locName = e.local_tax_jurisdiction_name || e.pa_psd_name || undefined;
      const locRate = e.local_tax_rate !== undefined && e.local_tax_rate !== null ? parseFloat(e.local_tax_rate) : (e.pa_resident_eit_rate ? parseFloat(e.pa_resident_eit_rate) : 0);
      const flatAnn = e.local_flat_tax_annual !== undefined && e.local_flat_tax_annual !== null ? parseFloat(e.local_flat_tax_annual) : (e.pa_lst_annual ? parseFloat(e.pa_lst_annual) : 52);
      const flatExempt = e.local_flat_tax_exempt ?? e.pa_lst_exempt ?? false;

      return {
        id: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        age: e.age ? parseInt(e.age, 10) : undefined,
        email: e.email,
        phone: e.phone,
        ssnLastFour: e.ssn_last_four,
        streetAddress: e.street_address || undefined,
        city: e.city || undefined,
        state: e.state || undefined,
        zip: e.zip || undefined,
        employmentType: e.employment_type,
        payRate: parseFloat(e.pay_rate),
        payFrequency: e.pay_frequency,
        w4FilingStatus: e.w4_filing_status,
        w4MultipleJobs: e.w4_multiple_jobs,
        w4DependentCredit: parseFloat(e.w4_dependent_credit),
        w4OtherIncome: parseFloat(e.w4_other_income),
        w4Deductions: parseFloat(e.w4_deductions),
        w4ExtraWithholding: parseFloat(e.w4_extra_withholding),
        workState: e.work_state || undefined,
        stateW4FilingStatus: e.state_w4_filing_status || undefined,
        stateAllowances: e.state_allowances ? parseInt(e.state_allowances, 10) : 0,
        localTaxJurisdictionCode: locCode,
        localTaxJurisdictionName: locName,
        localTaxRate: locRate,
        localFlatTaxAnnual: flatAnn,
        localFlatTaxExempt: flatExempt,
        taxAttributes: e.tax_attributes || undefined,
        paPsdCode: locCode || '',
        paPsdName: locName || '',
        paResidentEitRate: locRate,
        paWorkPsdCode: locCode || '',
        paWorkEitRate: locRate,
        paLstAnnual: flatAnn,
        paLstExempt: flatExempt,
        bankName: e.bank_name || undefined,
        accountType: e.account_type || 'CHECKING',
        routingNumber: e.routing_number || undefined,
        accountNumber: e.account_number || undefined,
        bankAccountMasked: e.bank_account_masked || undefined,
        isActive: e.is_active,
      };
    });

    const mileageLogs = milRes.rows.map(m => ({
      id: m.id,
      employeeId: m.employee_id,
      tripDate: m.trip_date,
      originLocation: m.origin_location,
      destinationLocation: m.destination_location,
      businessPurpose: m.business_purpose,
      startOdometer: parseFloat(m.start_odometer),
      endOdometer: parseFloat(m.end_odometer),
      calculatedMiles: parseFloat(m.calculated_miles),
      rateApplied: parseFloat(m.rate_applied),
      mileageAllowance: parseFloat(m.mileage_allowance),
      isReimbursableAccountablePlan: m.is_reimbursable_accountable_plan,
      status: m.status,
      linkedPayStubId: m.linked_pay_stub_id,
      notes: m.notes,
      createdAt: m.created_at,
    }));

    const travelExpenses = trvRes.rows.map(t => ({
      id: t.id,
      employeeId: t.employee_id,
      mileageLogId: t.mileage_log_id,
      expenseDate: t.expense_date,
      category: t.category,
      description: t.description,
      amount: parseFloat(t.amount),
      paymentSource: t.payment_source,
      receiptNote: t.receipt_note,
      receiptUrl: t.receipt_url,
      isReimbursable: t.is_reimbursable,
      status: t.status,
      linkedPayStubId: t.linked_pay_stub_id,
      createdAt: t.created_at,
    }));

    const payrollRuns = runRes.rows.map(r => ({
      id: r.id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date,
      status: r.status,
      totalGross: parseFloat(r.total_gross),
      totalEmployeeTaxes: parseFloat(r.total_employee_taxes),
      totalReimbursements: parseFloat(r.total_reimbursements),
      totalNetPay: parseFloat(r.total_net_pay),
      totalEmployerTaxes: parseFloat(r.total_employer_taxes),
      totalCompanyCost: parseFloat(r.total_company_cost),
      stubsCount: r.stubs_count,
      createdAt: r.created_at,
      lockedAt: r.locked_at,
    }));

    const payStubs = stubRes.rows.map(s => {
      const stateCode = s.state_code || 'PA';
      const localityCode = s.locality_code || undefined;
      const localityName = s.locality_name || undefined;
      const stateIncTax = parseFloat(s.state_income_tax ?? s.pa_state_tax ?? 0);
      const localIncTax = parseFloat(s.local_income_tax ?? s.pa_local_eit ?? 0);
      const localFlat = parseFloat(s.local_flat_tax ?? s.pa_lst ?? 0);
      const employerSuta = parseFloat(s.employer_state_unemployment ?? s.employer_pa_uc ?? 0);

      return {
        id: s.id,
        payrollRunId: s.payroll_run_id,
        employeeId: s.employee_id,
        periodStart: s.period_start,
        periodEnd: s.period_end,
        payDate: s.pay_date,
        hoursWorked: parseFloat(s.hours_worked),
        overtimeHours: parseFloat(s.overtime_hours),
        hourlyRate: parseFloat(s.hourly_rate),
        grossEarnings: parseFloat(s.gross_earnings),
        federalIncomeTax: parseFloat(s.federal_income_tax),
        socialSecurityTax: parseFloat(s.social_security_tax),
        medicareTax: parseFloat(s.medicare_tax),
        stateCode,
        localityCode,
        localityName,
        stateIncomeTax: stateIncTax,
        localIncomeTax: localIncTax,
        localFlatTax: localFlat,
        paStateTax: stateIncTax,
        paLocalEit: localIncTax,
        paLst: localFlat,
        totalEmployeeTaxes: parseFloat(s.total_employee_taxes),
        mileageReimbursement: parseFloat(s.mileage_reimbursement),
        travelExpensesReimbursement: parseFloat(s.travel_expenses_reimbursement),
        totalReimbursements: parseFloat(s.total_reimbursements),
        netPay: parseFloat(s.net_pay),
        employerSocialSecurity: parseFloat(s.employer_social_security),
        employerMedicare: parseFloat(s.employer_medicare),
        employerStateUnemployment: employerSuta,
        employerPaUc: employerSuta,
        taxBreakdown: s.tax_breakdown || undefined,
        totalEmployerTaxes: parseFloat(s.total_employer_taxes),
        totalCompanyCost: parseFloat(s.total_company_cost),
        disbursementMethod: s.disbursement_method || 'ACH',
        disbursementStatus: s.disbursement_status,
        achTraceRef: s.ach_trace_ref || s.zelle_confirmation_ref || undefined,
        paidAt: s.paid_at,
        createdAt: s.created_at,
      };
    });

    const complianceTasks = taskRes.rows.map(c => ({
      id: c.id,
      jurisdiction: c.jurisdiction,
      formIdentifier: c.form_identifier,
      title: c.title,
      taxPeriodLabel: c.tax_period_label,
      dueDate: c.due_date,
      filingMethod: c.filing_method,
      portalUrl: c.portal_url,
      status: c.status,
      amountDue: parseFloat(c.amount_due),
      boxValues: c.box_values,
      confirmationNumber: c.confirmation_number,
      filedDate: c.filed_date,
      notes: c.notes,
      createdAt: c.created_at,
    }));

    const generalExpenses = genRes.rows.map(g => ({
      id: g.id,
      expenseDate: g.expense_date,
      category: g.category,
      payee: g.payee,
      description: g.description,
      amount: parseFloat(g.amount),
      scheduleCLine: g.schedule_c_line,
      isTaxDeductible: g.is_tax_deductible,
      notes: g.notes,
      createdAt: g.created_at,
    }));

    const timesheets = tsRes.rows.map(t => ({
      id: t.id,
      employeeId: t.employee_id,
      workDate: t.work_date,
      startTime: t.start_time,
      endTime: t.end_time,
      unpaidBreakMinutes: parseInt(t.unpaid_break_minutes || '0', 10),
      regularHours: parseFloat(t.regular_hours),
      overtimeHours: parseFloat(t.overtime_hours),
      notes: t.notes,
      status: t.status,
      linkedPayStubId: t.linked_pay_stub_id,
      createdAt: t.created_at,
    }));

    const auditLogs = auditRes.rows.map(a => ({
      id: a.id,
      companyId: a.companyId,
      entityType: a.entityType,
      entityId: a.entityId,
      action: a.action,
      actorId: a.actorId,
      previousState: a.previousState,
      newState: a.newState,
      reason: a.reason,
      timestamp: a.timestamp,
    }));

    let taxYears = tyRes.rows.map(t => ({
      id: t.id,
      companyId: t.companyId,
      year: parseInt(t.year, 10),
      status: t.status,
      createdAt: t.createdAt,
    }));

    if (taxYears.length === 0) {
      taxYears = [{
        id: 'ty_2026',
        companyId: org?.id || 'comp_main',
        year: 2026,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      }];
    }

    return {
      company: org,
      org,
      employees,
      mileageLogs,
      travelExpenses,
      payrollRuns,
      payStubs,
      complianceTasks,
      generalExpenses,
      timesheets,
      auditLogs,
      taxYears,
    };
  } catch (err) {
    console.error('Error loading data from PostgreSQL:', err);
    return null;
  } finally {
    client.release();
  }
}

export async function saveAllDataToPostgres(data: any): Promise<{ success: boolean; error?: string }> {
  const pool = getPool();
  if (!pool) {
    return { success: false, error: 'No POSTGRES_URL configured' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Save state snapshot
    await client.query(
      `INSERT INTO app_state_snapshots (id, data, updated_at) 
       VALUES ('current_state', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(data)]
    );

    // 2. Sync companies & organizations tables
    const companyData = data.company || data.org;
    if (companyData) {
      const compId = companyData.id || 'comp_main';

      // Save to companies table
      await client.query(
        `INSERT INTO companies (
          id, name, ein, "stateTaxId", address, city, state, zip, 
          "ownerName", "ownerEmail", "ownerTaxBracket", "stateFilingFrequency", "payFrequency", "standardMileageRate", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          ein = EXCLUDED.ein,
          "stateTaxId" = EXCLUDED."stateTaxId",
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          "ownerName" = EXCLUDED."ownerName",
          "ownerEmail" = EXCLUDED."ownerEmail",
          "ownerTaxBracket" = EXCLUDED."ownerTaxBracket",
          "stateFilingFrequency" = EXCLUDED."stateFilingFrequency",
          "payFrequency" = EXCLUDED."payFrequency",
          "standardMileageRate" = EXCLUDED."standardMileageRate",
          "updatedAt" = CURRENT_TIMESTAMP`,
        [
          compId,
          companyData.name || 'Unnamed LLC',
          companyData.ein || '00-0000000',
          companyData.stateTaxId || 'PA-00000000',
          companyData.address || 'Address Pending',
          companyData.city || 'Philadelphia',
          companyData.state || 'PA',
          companyData.zip || '19102',
          companyData.ownerName || 'Managing Member',
          companyData.ownerEmail || 'owner@micro-llc.tax',
          companyData.ownerTaxBracket || 24,
          companyData.stateFilingFrequency || companyData.filingFrequencyPA || companyData.filingFrequencyPa || 'MONTHLY',
          companyData.payFrequency || 'BI_WEEKLY',
          companyData.standardMileageRate || 0.67,
        ]
      );
    }

    // 3. Sync Employees
    if (Array.isArray(data.employees)) {
      await client.query('DELETE FROM employees');
      for (const emp of data.employees) {
        const locCode = emp.localTaxJurisdictionCode || emp.paPsdCode || null;
        const locName = emp.localTaxJurisdictionName || emp.paPsdName || null;
        const locRate = emp.localTaxRate ?? emp.paResidentEitRate ?? 0;
        const flatAnn = emp.localFlatTaxAnnual ?? emp.paLstAnnual ?? 52;
        const flatExempt = emp.localFlatTaxExempt ?? emp.paLstExempt ?? false;

        await client.query(
          `INSERT INTO employees (
            id, first_name, last_name, age, email, phone, ssn_last_four, 
            street_address, city, state, zip,
            employment_type, pay_rate, pay_frequency, w4_filing_status, 
            w4_multiple_jobs, w4_dependent_credit, w4_other_income, 
            w4_deductions, w4_extra_withholding, work_state, state_w4_filing_status,
            state_allowances, local_tax_jurisdiction_code, local_tax_jurisdiction_name,
            local_tax_rate, local_flat_tax_annual, local_flat_tax_exempt, tax_attributes,
            bank_name, account_type, routing_number, account_number, bank_account_masked, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)`,
          [
            emp.id, emp.firstName, emp.lastName, emp.age ?? null, emp.email, emp.phone, emp.ssnLastFour,
            emp.streetAddress || null, emp.city || null, emp.state || null, emp.zip || null,
            emp.employmentType, emp.payRate, emp.payFrequency, emp.w4FilingStatus,
            emp.w4MultipleJobs || false, emp.w4DependentCredit || 0, emp.w4OtherIncome || 0,
            emp.w4Deductions || 0, emp.w4ExtraWithholding || 0, emp.workState || null,
            emp.stateW4FilingStatus || null, emp.stateAllowances || 0, locCode, locName,
            locRate, flatAnn, flatExempt, emp.taxAttributes ? JSON.stringify(emp.taxAttributes) : null,
            emp.bankName || null, emp.accountType || 'CHECKING', emp.routingNumber || null, emp.accountNumber || null,
            emp.bankAccountMasked || null, emp.isActive ?? true
          ]
        );
      }
    }

    // 4. Sync Mileage Logs
    if (Array.isArray(data.mileageLogs)) {
      await client.query('DELETE FROM mileage_logs');
      for (const m of data.mileageLogs) {
        await client.query(
          `INSERT INTO mileage_logs (
            id, employee_id, trip_date, origin_location, destination_location,
            business_purpose, start_odometer, end_odometer, calculated_miles,
            rate_applied, mileage_allowance, is_reimbursable_accountable_plan,
            status, linked_pay_stub_id, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            m.id, m.employeeId, m.tripDate, m.originLocation, m.destinationLocation,
            m.businessPurpose, m.startOdometer, m.endOdometer, m.calculatedMiles,
            m.rateApplied, m.mileageAllowance, m.isReimbursableAccountablePlan ?? true,
            m.status, m.linkedPayStubId || null, m.notes || null
          ]
        );
      }
    }

    // 5. Sync Travel Expenses
    if (Array.isArray(data.travelExpenses)) {
      await client.query('DELETE FROM travel_expenses');
      for (const t of data.travelExpenses) {
        await client.query(
          `INSERT INTO travel_expenses (
            id, employee_id, mileage_log_id, expense_date, category,
            description, amount, payment_source, receipt_note, receipt_url,
            is_reimbursable, status, linked_pay_stub_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            t.id, t.employeeId, t.mileageLogId || null, t.expenseDate, t.category,
            t.description, t.amount, t.paymentSource, t.receiptNote || null,
            t.receiptUrl || null, t.isReimbursable ?? true, t.status, t.linkedPayStubId || null
          ]
        );
      }
    }

    // 6. Sync Payroll Runs
    if (Array.isArray(data.payrollRuns)) {
      await client.query('DELETE FROM payroll_runs');
      for (const r of data.payrollRuns) {
        await client.query(
          `INSERT INTO payroll_runs (
            id, period_start, period_end, pay_date, status,
            total_gross, total_employee_taxes, total_reimbursements,
            total_net_pay, total_employer_taxes, total_company_cost, stubs_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            r.id, r.periodStart, r.periodEnd, r.payDate, r.status,
            r.totalGross, r.totalEmployeeTaxes, r.totalReimbursements,
            r.totalNetPay, r.totalEmployerTaxes, r.totalCompanyCost, r.stubsCount
          ]
        );
      }
    }

    // 7. Sync Pay Stubs
    if (Array.isArray(data.payStubs)) {
      await client.query('DELETE FROM pay_stubs');
      for (const s of data.payStubs) {
        const stateCode = s.stateCode || 'PA';
        const localityCode = s.localityCode || s.paPsdCode || null;
        const localityName = s.localityName || s.paPsdName || null;
        const stateInc = s.stateIncomeTax ?? s.paStateTax ?? 0;
        const localInc = s.localIncomeTax ?? s.paLocalEit ?? 0;
        const localFlat = s.localFlatTax ?? s.paLst ?? 0;
        const employerSuta = s.employerStateUnemployment ?? s.employerPaUc ?? 0;

        await client.query(
          `INSERT INTO pay_stubs (
            id, payroll_run_id, employee_id, period_start, period_end, pay_date,
            hours_worked, overtime_hours, hourly_rate, gross_earnings,
            federal_income_tax, social_security_tax, medicare_tax,
            state_code, locality_code, locality_name, state_income_tax,
            local_income_tax, local_flat_tax, total_employee_taxes, mileage_reimbursement,
            travel_expenses_reimbursement, total_reimbursements, net_pay,
            employer_social_security, employer_medicare, employer_state_unemployment,
            tax_breakdown, total_employer_taxes, total_company_cost, disbursement_method,
            disbursement_status, ach_trace_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
          [
            s.id, s.payrollRunId, s.employeeId, s.periodStart, s.periodEnd, s.payDate,
            s.hoursWorked, s.overtimeHours, s.hourlyRate, s.grossEarnings,
            s.federalIncomeTax, s.socialSecurityTax, s.medicareTax,
            stateCode, localityCode, localityName, stateInc,
            localInc, localFlat, s.totalEmployeeTaxes, s.mileageReimbursement,
            s.travelExpensesReimbursement, s.totalReimbursements, s.netPay,
            s.employerSocialSecurity, s.employerMedicare, employerSuta,
            s.taxBreakdown ? JSON.stringify(s.taxBreakdown) : null,
            s.totalEmployerTaxes, s.totalCompanyCost, s.disbursementMethod || 'ACH',
            s.disbursementStatus, s.achTraceRef || (s as any).zelleConfirmationRef || null
          ]
        );
      }
    }

    // 8. Sync Compliance Tasks
    if (Array.isArray(data.complianceTasks)) {
      await client.query('DELETE FROM compliance_tasks');
      for (const c of data.complianceTasks) {
        await client.query(
          `INSERT INTO compliance_tasks (
            id, jurisdiction, form_identifier, title, tax_period_label,
            due_date, filing_method, portal_url, status, amount_due,
            box_values, confirmation_number, filed_date, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            c.id, c.jurisdiction, c.formIdentifier, c.title, c.taxPeriodLabel,
            c.dueDate, c.filingMethod || null, c.portalUrl || null, c.status || 'PENDING', c.amountDue ?? 0,
            JSON.stringify(c.boxValues || {}), c.confirmationNumber || null,
            c.filedDate || null, c.notes || null
          ]
        );
      }
    }

    // 9. Sync General Expenses
    if (Array.isArray(data.generalExpenses)) {
      await client.query('DELETE FROM general_expenses');
      for (const g of data.generalExpenses) {
        await client.query(
          `INSERT INTO general_expenses (
            id, expense_date, category, payee, description, amount,
            schedule_c_line, is_tax_deductible, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            g.id, g.expenseDate, g.category, g.payee, g.description, g.amount,
            g.scheduleCLine || null, g.isTaxDeductible ?? true, g.notes || null
          ]
        );
      }
    }

    // 10. Sync Timesheets
    if (Array.isArray(data.timesheets)) {
      try {
        await client.query('DELETE FROM timesheets');
        for (const t of data.timesheets) {
          await client.query(
            `INSERT INTO timesheets (
              id, employee_id, work_date, start_time, end_time, unpaid_break_minutes,
              regular_hours, overtime_hours, notes, status, linked_pay_stub_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              t.id, t.employeeId, t.workDate, t.startTime, t.endTime, t.unpaidBreakMinutes || 0,
              t.regularHours, t.overtimeHours, t.notes || null, t.status || 'SUBMITTED', t.linkedPayStubId || null
            ]
          );
        }
      } catch (tsErr) {
        console.warn('Warning: Could not sync timesheets table:', tsErr);
      }
    }

    // 11. Sync Audit Logs
    if (Array.isArray(data.auditLogs)) {
      try {
        await client.query('DELETE FROM audit_log_entries');
        for (const log of data.auditLogs) {
          await client.query(
            `INSERT INTO audit_log_entries (
              id, "companyId", "entityType", "entityId", action, "actorId",
              "previousState", "newState", reason, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              log.id,
              log.companyId || data.org?.id || 'org_main',
              log.entityType,
              log.entityId,
              log.action,
              log.actorId,
              log.previousState ? JSON.stringify(log.previousState) : null,
              log.newState ? JSON.stringify(log.newState) : null,
              log.reason || null,
              log.timestamp || new Date().toISOString()
            ]
          );
        }
      } catch (auditErr) {
        console.warn('Warning: Could not sync audit_log_entries table:', auditErr);
      }
    }

    // 12. Sync Tax Years
    if (Array.isArray(data.taxYears)) {
      try {
        for (const ty of data.taxYears) {
          await client.query(
            `INSERT INTO tax_years (id, "companyId", year, status, "createdAt")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               year = EXCLUDED.year`,
            [
              ty.id || `ty_${ty.year}`,
              ty.companyId || companyData?.id || 'comp_main',
              ty.year,
              ty.status || 'ACTIVE',
              ty.createdAt || new Date().toISOString(),
            ]
          );
        }
      } catch (tyErr) {
        console.warn('Warning: Could not sync tax_years table:', tyErr);
      }
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error saving data to PostgreSQL:', err);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}
