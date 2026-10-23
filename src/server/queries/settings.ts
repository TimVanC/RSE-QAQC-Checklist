import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { appSettings } from '@/src/db/schema/system';
import { isIsoDate, type IsoDate } from '@/src/lib/time';

export const TRACKING_START_DATE_KEY = 'tracking_start_date';

/**
 * First New Jersey calendar day the completion tracker counts. Jobs before it were tracked in the
 * old workbooks (or not at all) and must not show as missing. Null means count everything.
 */
export async function getTrackingStartDate(): Promise<IsoDate | null> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, TRACKING_START_DATE_KEY))
    .limit(1);
  return typeof row?.value === 'string' && isIsoDate(row.value) ? row.value : null;
}
