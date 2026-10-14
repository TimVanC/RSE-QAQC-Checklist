import { asc } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { technicians } from '@/src/db/schema/hcp';
import { requirePageRole } from '@/src/lib/auth/session';
import { TechniciansTable } from './technicians-table';

export const dynamic = 'force-dynamic';

export default async function AdminTechniciansPage() {
  await requirePageRole('admin');
  const rows = await getDb()
    .select()
    .from(technicians)
    .orderBy(asc(technicians.firstName), asc(technicians.lastName));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Technicians</h1>
        <p className="text-muted-foreground text-sm">
          Everyone synced from Housecall Pro employees. Only people marked as technicians appear in the call queue,
          the completion tracker and production counts. These two switches are never changed by the sync.
        </p>
      </div>
      <TechniciansTable
        rows={rows.map((t) => ({
          id: t.id,
          name: `${t.firstName} ${t.lastName}`.trim() || t.hcpEmployeeId,
          email: t.email,
          hcpRole: t.hcpRole,
          colorHex: t.colorHex,
          isTechnician: t.isTechnician,
          active: t.active,
          syncedAt: t.syncedAt.toISOString(),
        }))}
      />
    </div>
  );
}
