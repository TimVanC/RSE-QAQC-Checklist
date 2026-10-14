import { describe, expect, it } from 'vitest';
import {
  customerDisplayName,
  formatAddress,
  hcpDateOnly,
  isTechnicianRole,
  mapAppointment,
  mapEmployee,
  mapInvoice,
  mapJob,
  mapPayment,
  parseHcpTimestamp,
} from '@/src/lib/hcp/mappers';
import { inferProjectType } from '@/src/lib/hcp/project-type';
import type { HcpJob } from '@/src/lib/hcp/types';

const now = new Date('2026-10-13T12:00:00Z');

const job: HcpJob = {
  id: 'job_1',
  invoice_number: '1042',
  description: 'No cooling upstairs',
  customer: { id: 'cus_1', first_name: 'Pat', last_name: 'Lee', email: null, mobile_number: null, company: null },
  address: { street: '1 Main St', street_line_2: 'Unit 2', city: 'Newark', state: 'NJ', zip: '07102' },
  work_status: 'scheduled',
  work_timestamps: { on_my_way_at: null, started_at: '2026-07-06T13:05:00', completed_at: null },
  schedule: { scheduled_start: '2026-07-06T13:00:00Z', scheduled_end: '2026-07-06T15:00:00Z', arrival_window: 60, time_zone: 'America/New_York' },
  total_amount: 45000,
  outstanding_balance: 0,
  assigned_employees: [],
  tags: ['AC', 'PM Program'],
  job_fields: { job_type: { id: 'jt1', name: 'HVAC Service Call' } },
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-06T16:00:00Z',
};

describe('parseHcpTimestamp', () => {
  it('parses offset, naive and date-only values; naive is read as UTC', () => {
    expect(parseHcpTimestamp('2026-07-06T13:00:00Z')?.toISOString()).toBe('2026-07-06T13:00:00.000Z');
    expect(parseHcpTimestamp('2026-07-06T09:00:00-04:00')?.toISOString()).toBe('2026-07-06T13:00:00.000Z');
    expect(parseHcpTimestamp('2026-07-06T13:05:00')?.toISOString()).toBe('2026-07-06T13:05:00.000Z');
    expect(parseHcpTimestamp('2026-07-06')?.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(parseHcpTimestamp(null)).toBeNull();
    expect(parseHcpTimestamp('')).toBeNull();
    expect(parseHcpTimestamp('garbage')).toBeNull();
  });

  it('extracts date-only strings', () => {
    expect(hcpDateOnly('2026-07-06')).toBe('2026-07-06');
    expect(hcpDateOnly('2026-07-06T13:00:00Z')).toBe('2026-07-06');
    expect(hcpDateOnly(undefined)).toBeNull();
  });
});

describe('mapJob', () => {
  it('maps the fields the app reads and keeps the raw object', () => {
    const row = mapJob(job, now);
    expect(row).toMatchObject({
      hcpJobId: 'job_1',
      invoiceNumber: '1042',
      hcpCustomerId: 'cus_1',
      customerName: 'Pat Lee',
      addressLine1: '1 Main St',
      addressFormatted: '1 Main St, Unit 2, Newark, NJ 07102',
      jobTypeName: 'HVAC Service Call',
      tags: ['AC', 'PM Program'],
      workStatus: 'scheduled',
      arrivalWindowMin: 60,
      hcpTimeZone: 'America/New_York',
      totalAmountCents: 45000,
      outstandingBalanceCents: 0,
      syncedAt: now,
    });
    expect(row.scheduledStart?.toISOString()).toBe('2026-07-06T13:00:00.000Z');
    expect(row.startedAt?.toISOString()).toBe('2026-07-06T13:05:00.000Z');
    expect(row.completedAt).toBeNull();
    expect(row.hcpUpdatedAt?.toISOString()).toBe('2026-07-06T16:00:00.000Z');
    expect(row.rawJson).toEqual(job);
  });

  it('tolerates missing nested objects', () => {
    const row = mapJob({ ...job, customer: null, address: null, schedule: null, work_timestamps: null, job_fields: null }, now);
    expect(row.customerName).toBe('');
    expect(row.hcpCustomerId).toBeNull();
    expect(row.addressFormatted).toBeNull();
    expect(row.scheduledStart).toBeNull();
    expect(row.jobTypeName).toBeNull();
  });
});

describe('customer and address helpers', () => {
  it('builds display names', () => {
    expect(customerDisplayName({ first_name: 'Pat', last_name: 'Lee', company: 'Acme' })).toBe('Pat Lee (Acme)');
    expect(customerDisplayName({ first_name: null, last_name: null, company: 'Acme' })).toBe('Acme');
    expect(customerDisplayName(null)).toBe('');
  });

  it('formats partial addresses', () => {
    expect(formatAddress({ street: '5 Oak', street_line_2: null, city: null, state: 'NJ', zip: null })).toBe('5 Oak, NJ');
    expect(formatAddress({ street: null, street_line_2: null, city: null, state: null, zip: null })).toBeNull();
  });
});

describe('mapEmployee', () => {
  it('flags field roles as technicians and keeps office staff out of the queue', () => {
    expect(isTechnicianRole('field tech')).toBe(true);
    expect(isTechnicianRole('office staff')).toBe(false);
    expect(isTechnicianRole(null)).toBe(true);
    const row = mapEmployee(
      { id: 'emp_1', first_name: 'Sam', last_name: 'Q', email: 's@x.com', mobile_number: null, color_hex: '#ff0', role: 'field tech' },
      now,
    );
    expect(row).toMatchObject({ hcpEmployeeId: 'emp_1', firstName: 'Sam', lastName: 'Q', isTechnician: true, hcpRole: 'field tech' });
  });
});

describe('appointments, invoices and payments', () => {
  it('maps an appointment', () => {
    const row = mapAppointment(
      { id: 'apt_1', start_date: '2026-07-06', start_time: '2026-07-06T13:00:00Z', end_time: '2026-07-06T15:00:00Z', arrival_window_minutes: 30, dispatched_employees_ids: ['emp_1'] },
      'job_1',
      now,
    );
    expect(row).toMatchObject({ hcpAppointmentId: 'apt_1', hcpJobId: 'job_1', startDate: '2026-07-06', arrivalWindowMin: 30, dispatchedEmployeeIds: ['emp_1'], anytime: false });
  });

  it('maps an invoice and its payment', () => {
    const inv = mapInvoice(
      { id: 'inv_1', status: 'paid', invoice_number: '1042', amount: 45000, due_amount: 0, due_at: null, paid_at: '2026-07-06T15:10:00Z', sent_at: null, service_date: '2026-07-06' },
      'job_1',
      now,
    );
    expect(inv).toMatchObject({ hcpInvoiceId: 'inv_1', hcpJobId: 'job_1', status: 'paid', amountCents: 45000, dueAmountCents: 0, serviceDate: '2026-07-06' });
    const pay = mapPayment({ id: 'pay_1', status: 'succeeded', payment_method: 'credit_card', amount: 45000, paid_at: '2026-07-06T15:10:00Z' }, 'inv_1', 'job_1', now);
    expect(pay).toMatchObject({ hcpPaymentId: 'pay_1', hcpInvoiceId: 'inv_1', hcpJobId: 'job_1', amountCents: 45000, paymentMethod: 'credit_card' });
  });
});

describe('inferProjectType', () => {
  it('maps common job types and tags', () => {
    expect(inferProjectType({ jobTypeName: 'HVAC Service Call' })).toBe('HVAC');
    expect(inferProjectType({ jobTypeName: 'Water Heater Replacement' })).toBe('WATER HEATER');
    expect(inferProjectType({ jobTypeName: 'Generac install' })).toBe('GENERATOR');
    expect(inferProjectType({ jobTypeName: 'Service', tags: ['Tankless'] })).toBe('WATER HEATER');
    expect(inferProjectType({ jobTypeName: 'Service', description: 'No heat, furnace not igniting' })).toBe('HVAC');
  });

  it('prefers the job type over tags and returns null when nothing matches', () => {
    expect(inferProjectType({ jobTypeName: 'Generator PM', tags: ['AC'] })).toBe('GENERATOR');
    expect(inferProjectType({ jobTypeName: 'Estimate', tags: ['PM Program'] })).toBeNull();
    expect(inferProjectType({})).toBeNull();
  });
});
