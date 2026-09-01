import { describe, it, expect } from 'vitest';
import {
  calculateTimesheetHours,
  getApprovedHoursForEmployee,
  formatHours,
  generateBulkTimesheets,
} from './timesheetUtils';
import { TimesheetEntry } from '../types';

describe('timesheetUtils', () => {
  describe('calculateTimesheetHours', () => {
    it('calculates standard 8-hour workday with 30 minute unpaid break', () => {
      const result = calculateTimesheetHours('08:30', '17:00', 30);
      expect(result.totalNetHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('calculates overtime when net hours exceed 8 hours per day', () => {
      const result = calculateTimesheetHours('08:00', '18:30', 30);
      // Total span: 10.5 hrs - 0.5 hr break = 10 hrs net work
      expect(result.totalNetHours).toBe(10);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(2);
    });

    it('handles zero break correctly', () => {
      const result = calculateTimesheetHours('09:00', '17:00', 0);
      expect(result.totalNetHours).toBe(8);
      expect(result.regularHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
    });

    it('handles overnight shifts crossing midnight', () => {
      const result = calculateTimesheetHours('22:00', '06:00', 30);
      // Total span: 8 hrs - 0.5 hr break = 7.5 hrs net
      expect(result.totalNetHours).toBe(7.5);
      expect(result.regularHours).toBe(7.5);
      expect(result.overtimeHours).toBe(0);
    });

    it('returns 0 when start or end time is missing', () => {
      const result = calculateTimesheetHours('', '17:00');
      expect(result.totalNetHours).toBe(0);
      expect(result.regularHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
    });
  });

  describe('getApprovedHoursForEmployee', () => {
    const sampleEntries: TimesheetEntry[] = [
      {
        id: 't1',
        employeeId: 'emp_01',
        workDate: '2026-08-03',
        startTime: '08:00',
        endTime: '17:00',
        unpaidBreakMinutes: 60,
        regularHours: 8,
        overtimeHours: 0,
        status: 'APPROVED',
        createdAt: '2026-08-03T17:00:00Z',
      },
      {
        id: 't2',
        employeeId: 'emp_01',
        workDate: '2026-08-04',
        startTime: '08:00',
        endTime: '19:00',
        unpaidBreakMinutes: 60,
        regularHours: 8,
        overtimeHours: 2,
        status: 'APPROVED',
        createdAt: '2026-08-04T19:00:00Z',
      },
      {
        id: 't3',
        employeeId: 'emp_01',
        workDate: '2026-08-05',
        startTime: '08:00',
        endTime: '17:00',
        unpaidBreakMinutes: 60,
        regularHours: 8,
        overtimeHours: 0,
        status: 'SUBMITTED', // Unapproved - should be excluded
        createdAt: '2026-08-05T17:00:00Z',
      },
      {
        id: 't4',
        employeeId: 'emp_02', // Different employee
        workDate: '2026-08-03',
        startTime: '08:00',
        endTime: '17:00',
        unpaidBreakMinutes: 60,
        regularHours: 8,
        overtimeHours: 0,
        status: 'APPROVED',
        createdAt: '2026-08-03T17:00:00Z',
      },
    ];

    it('sums approved hours for a specific employee within pay period', () => {
      const hours = getApprovedHoursForEmployee(
        sampleEntries,
        'emp_01',
        '2026-08-01',
        '2026-08-15'
      );
      expect(hours.regular).toBe(16);
      expect(hours.overtime).toBe(2);
    });

    it('returns 0 if no approved entries match range', () => {
      const hours = getApprovedHoursForEmployee(
        sampleEntries,
        'emp_01',
        '2026-09-01',
        '2026-09-15'
      );
      expect(hours.regular).toBe(0);
      expect(hours.overtime).toBe(0);
    });

    it('correctly returns 0 hours for employee without approved timesheets in date range', () => {
      const hours = getApprovedHoursForEmployee(
        sampleEntries,
        'emp_02',
        '2026-08-04',
        '2026-08-15'
      );
      expect(hours.regular).toBe(0);
      expect(hours.overtime).toBe(0);
    });
  });

  describe('formatHours', () => {
    it('formats numbers with 1 decimal place and unit suffix', () => {
      expect(formatHours(8)).toBe('8.0 hrs');
      expect(formatHours(7.5)).toBe('7.5 hrs');
    });
  });

  describe('generateBulkTimesheets', () => {
    it('generates 5 weekday entries for a Mon-Fri date range', () => {
      const entries = generateBulkTimesheets({
        employeeId: 'emp_01',
        startDate: '2026-08-10', // Monday
        endDate: '2026-08-14', // Friday
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        startTime: '08:30',
        endTime: '17:00',
        unpaidBreakMinutes: 30,
        notes: 'Standard weekly shift',
      });

      expect(entries.length).toBe(5);
      expect(entries[0].workDate).toBe('2026-08-10');
      expect(entries[4].workDate).toBe('2026-08-14');
      expect(entries[0].regularHours).toBe(8);
      expect(entries[0].status).toBe('APPROVED');
    });

    it('skips weekends when daysOfWeek excludes 0 and 6', () => {
      const entries = generateBulkTimesheets({
        employeeId: 'emp_01',
        startDate: '2026-08-08', // Saturday
        endDate: '2026-08-10', // Monday
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '17:00',
        unpaidBreakMinutes: 0,
      });

      // Should only generate 1 entry (Monday 2026-08-10)
      expect(entries.length).toBe(1);
      expect(entries[0].workDate).toBe('2026-08-10');
    });
  });
});
