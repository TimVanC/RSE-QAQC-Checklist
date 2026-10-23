'use server';

import { format, parseISO, subMonths, addMonths } from 'date-fns';
import { and, eq, gte, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { payPeriods } from '@/src/db/schema/checklists';
import { appSettings } from '@/src/db/schema/system';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import { generatePayPeriods as generatePeriodSpans } from '@/src/lib/pay-periods';
import { isIsoDate, todayAppDate } from '@/src/lib/time';
import { PAY_PERIOD_RULE_KEY, getPayPeriodRule } from '@/src/server/queries/pay-periods';
import type { ActionResult } from './checklists';

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err instanceof Error && err.name === 'UnauthenticatedError') return 'Please sign in again.';
  console.error('[pay-periods] action failed', err);
  return 'Something went wrong. Please try again.';
}

function revalidateReports() {
  revalidatePath('/admin/pay-periods');
  revalidatePath('/tracker');
  revalidatePath('/production');
}

const trackingStartSchema = z.object({ date: z.string().refine(isIsoDate, 'invalid date').nullable() });

/**
 * First New Jersey day the completion tracker counts. Jobs scheduled before it never show as
 * missing (they were tracked in the old workbooks, or predate the app). Null counts everything.
 */
export async function saveTrackingStartDate(input: { date: string | null }): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = trackingStartSchema.safeParse(input);
    if (!parsed.success) return fail('Enter a valid date.');
    const db = getDb();
    const key = 'tracking_start_date';
    const [before] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
    await db
      .insert(appSettings)
      .values({ key, value: parsed.data.date, updatedBy: admin.id })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: parsed.data.date, updatedBy: admin.id, updatedAt: new Date() } });
    await recordAudit(db, { userId: admin.id, entity: 'app_setting', entityId: key, action: 'set', before: { value: before?.value ?? null }, after: { value: parsed.data.date } });
    revalidateReports();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const ruleSchema = z.object({
  cadence: z.enum(['weekly', 'biweekly', 'monthly']),
  anchor: z.string().refine(isIsoDate, 'invalid date'),
});

/** Save the cadence and anchor used to compute and generate pay periods. */
export async function savePayPeriodRule(input: {
  cadence: string;
  anchor: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) return fail('Pick a cadence and a valid anchor date.');
    const rule = parsed.data;
    const db = getDb();
    const before = await getPayPeriodRule();
    await db
      .insert(appSettings)
      .values({ key: PAY_PERIOD_RULE_KEY, value: rule, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: rule, updatedBy: admin.id, updatedAt: new Date() },
      });
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_setting',
      entityId: PAY_PERIOD_RULE_KEY,
      action: 'update',
      before: { ...before },
      after: { ...rule },
    });
    revalidateReports();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const generateSchema = z.object({ months: z.number().int().min(1).max(36) });

/**
 * Store every period (from the current rule) overlapping [today - 1 month, today + months].
 * Existing periods are kept: a period with the same start date is skipped, and so is one that
 * would overlap a stored period with a different start (left over from an earlier rule).
 */
export async function generatePayPeriods(input: {
  months: number;
}): Promise<ActionResult<{ added: number; skipped: number }>> {
  try {
    const admin = await requireRole('admin');
    const parsed = generateSchema.safeParse(input);
    if (!parsed.success) return fail('Months must be a whole number from 1 to 36.');
    const { months } = parsed.data;
    const db = getDb();

    const today = parseISO(todayAppDate());
    const from = format(subMonths(today, 1), 'yyyy-MM-dd');
    const to = format(addMonths(today, months), 'yyyy-MM-dd');
    const rule = await getPayPeriodRule();
    const spans = generatePeriodSpans(rule, from, to);
    if (spans.length === 0) return { ok: true, data: { added: 0, skipped: 0 } };

    const first = spans[0].start_date;
    const last = spans[spans.length - 1].end_date;
    const existing = await db
      .select({ startDate: payPeriods.startDate, endDate: payPeriods.endDate })
      .from(payPeriods)
      .where(and(lte(payPeriods.startDate, last), gte(payPeriods.endDate, first)));
    const fresh = spans.filter(
      (s) => !existing.some((e) => e.startDate <= s.end_date && s.start_date <= e.endDate),
    );

    const inserted =
      fresh.length === 0
        ? []
        : await db
            .insert(payPeriods)
            .values(
              fresh.map((s) => ({ label: s.label, startDate: s.start_date, endDate: s.end_date })),
            )
            .onConflictDoNothing({ target: payPeriods.startDate })
            .returning({ id: payPeriods.id });

    const added = inserted.length;
    const skipped = spans.length - added;
    await recordAudit(db, {
      userId: admin.id,
      entity: 'pay_period',
      entityId: 'generate',
      action: 'generate',
      after: { rule: { ...rule }, from, to, months, added, skipped },
    });
    revalidateReports();
    return { ok: true, data: { added, skipped } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

export async function deletePayPeriod(id: string): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    if (!z.string().uuid().safeParse(id).success) return fail('Invalid pay period.');
    const db = getDb();
    const [row] = await db.delete(payPeriods).where(eq(payPeriods.id, id)).returning();
    if (!row) return fail('Pay period not found.');
    await recordAudit(db, {
      userId: admin.id,
      entity: 'pay_period',
      entityId: id,
      action: 'delete',
      before: { label: row.label, start_date: row.startDate, end_date: row.endDate },
    });
    revalidateReports();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}
