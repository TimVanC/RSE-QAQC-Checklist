/**
 * Idempotent seed: the first admin user and default app settings.
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME="Your Name" npm run db:seed
 *
 * The admin's Neon Auth user must exist as well (created through the Neon console or MCP, or by
 * the in-app invite flow once another admin exists). Safe to re-run.
 */
import { eq, sql } from 'drizzle-orm';

async function main() {
  const { getDb } = await import('./index');
  const { appUsers } = await import('./schema/users');
  const { appSettings } = await import('./schema/system');
  const { DEFAULT_PAY_PERIOD_RULE } = await import('../lib/pay-periods');

  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = (process.env.SEED_ADMIN_NAME ?? '').trim();
  if (!email || !name) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_NAME are required');
  }

  const db = getDb();

  const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
  if (existing) {
    if (existing.role !== 'admin' || !existing.active) {
      await db
        .update(appUsers)
        .set({ role: 'admin', active: true, updatedAt: new Date() })
        .where(eq(appUsers.id, existing.id));
      console.log(`updated ${email}: role=admin active=true`);
    } else {
      console.log(`admin ${email} already present`);
    }
  } else {
    await db.insert(appUsers).values({ email, name, role: 'admin', active: true });
    console.log(`created admin ${email}`);
  }

  const defaults: Array<{ key: string; value: unknown }> = [
    { key: 'pay_period_rule', value: DEFAULT_PAY_PERIOD_RULE },
    { key: 'excluded_job_types', value: [] },
    { key: 'timezone', value: 'America/New_York' },
  ];
  for (const { key, value } of defaults) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoNothing({ target: appSettings.key });
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(appSettings);
  console.log(`app_settings rows: ${count}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
