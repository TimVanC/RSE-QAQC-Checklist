/**
 * Housecall Pro Public API shapes used by the sync. Only the fields we read are typed; every
 * object is also stored verbatim in `raw_json`. See docs/reference/housecall-pro-api.md.
 */

/**
 * Shape of every list response. The items live under a named array (`jobs`, `employees`,
 * `customers`, `invoices`, ...) whose key differs per endpoint, so it is typed loosely.
 */
export interface HcpPaginated {
  page: number;
  page_size: number;
  total_pages: number;
  total_items: number;
  [key: string]: unknown;
}

export interface HcpEmployee {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_number: string | null;
  color_hex: string | null;
  avatar_url?: string | null;
  role: string | null;
  tags?: string[];
  permissions?: Record<string, unknown>;
  company_id?: string;
  created_at?: string;
}

export interface HcpCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_number: string | null;
  home_number?: string | null;
  work_number?: string | null;
  company: string | null;
  lead_source?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface HcpAddress {
  id?: string;
  type?: 'billing' | 'service' | string;
  street: string | null;
  street_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country?: string | null;
}

export interface HcpWorkTimestamps {
  on_my_way_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface HcpSchedule {
  scheduled_start: string | null;
  scheduled_end: string | null;
  arrival_window: number | null;
  time_zone?: string | null;
  scheduled_start_local?: string | null;
  scheduled_end_local?: string | null;
  appointments?: HcpAppointment[];
}

export interface HcpAppointment {
  id: string;
  start_date?: string | null;
  start_time: string | null;
  end_time: string | null;
  anytime?: boolean;
  arrival_window_minutes?: number | null;
  dispatched_employees_ids?: string[];
}

/** Response enum (differs from the filter enum). */
export type HcpWorkStatus =
  | 'needs scheduling'
  | 'scheduled'
  | 'in progress'
  | 'complete rated'
  | 'complete unrated'
  | 'user canceled'
  | 'pro canceled'
  | (string & {});

export interface HcpJob {
  id: string;
  invoice_number: string | null;
  description: string | null;
  customer: HcpCustomer | null;
  address: HcpAddress | null;
  work_status: HcpWorkStatus;
  work_timestamps: HcpWorkTimestamps | null;
  schedule: HcpSchedule | null;
  total_amount: number | null;
  outstanding_balance: number | null;
  subtotal?: number | null;
  assigned_employees: HcpEmployee[];
  tags: string[];
  lead_source?: string | null;
  original_estimate_id?: string | null;
  job_fields?: {
    job_type?: { id: string; name: string } | null;
    business_unit?: { id: string; name: string } | null;
  } | null;
  created_at: string;
  updated_at: string;
  canceled_at?: string | null;
  deleted_at?: string | null;
}

export type HcpInvoiceStatus =
  | 'open'
  | 'pending_payment'
  | 'paid'
  | 'voided'
  | 'uncollectible'
  | 'canceled'
  | (string & {});

export interface HcpPayment {
  id: string;
  status: string | null;
  payment_method: string | null;
  amount: number;
  note?: string | null;
  paid_at: string | null;
  category?: string | null;
}

export interface HcpInvoice {
  id: string;
  job_id?: string;
  status: HcpInvoiceStatus;
  invoice_number: string | null;
  amount: number;
  subtotal?: number;
  due_amount: number;
  due_at: string | null;
  paid_at: string | null;
  sent_at: string | null;
  service_date?: string | null;
  invoice_date?: string | null;
  payments?: HcpPayment[];
}

export interface HcpCompany {
  id?: string;
  name?: string;
  time_zone: string | null;
  locations?: unknown[];
}

export interface HcpWebhookPayload {
  company_id: string;
  event: string;
  event_occurred_at?: string;
  event_created_at?: string;
  job?: HcpJob;
  invoice?: HcpInvoice;
  customer?: HcpCustomer;
  appointment?: HcpAppointment & { job_id?: string };
  [key: string]: unknown;
}

/** Query params accepted by GET /jobs. */
export interface HcpJobsQuery {
  scheduled_start_min?: string;
  scheduled_start_max?: string;
  scheduled_end_min?: string;
  scheduled_end_max?: string;
  employee_ids?: string[];
  customer_id?: string;
  work_status?: Array<'unscheduled' | 'scheduled' | 'in_progress' | 'completed' | 'canceled'>;
  expand?: Array<'appointments' | 'attachments'>;
  sort_by?: 'created_at' | 'updated_at' | 'invoice_number' | 'id' | 'description' | 'work_status';
  sort_direction?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}
