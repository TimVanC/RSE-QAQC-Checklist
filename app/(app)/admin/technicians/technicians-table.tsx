'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatApp } from '@/src/lib/time';
import { setTechnicianFlag } from '@/src/server/actions/technicians';

export interface TechnicianRowData {
  id: string;
  name: string;
  email: string | null;
  hcpRole: string | null;
  colorHex: string | null;
  isTechnician: boolean;
  active: boolean;
  syncedAt: string;
}

export function TechniciansTable({ rows }: { rows: TechnicianRowData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(row: TechnicianRowData, field: 'isTechnician' | 'active', value: boolean) {
    startTransition(async () => {
      const result = await setTechnicianFlag({ technicianId: row.id, field, value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${row.name}: ${field === 'isTechnician' ? 'technician' : 'active'} ${value ? 'on' : 'off'}.`,
      );
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 z-10 bg-background shadow-[inset_-1px_0_0_var(--border)]">
            Name
          </TableHead>
          <TableHead>Housecall Pro role</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Technician</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Last synced</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={row.active ? '' : 'opacity-60'}>
            <TableCell className="sticky left-0 z-10 bg-background font-medium shadow-[inset_-1px_0_0_var(--border)]">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: row.colorHex ?? '#999' }}
                  aria-hidden
                />
                {row.name}
              </span>
            </TableCell>
            <TableCell>
              {row.hcpRole ? (
                <Badge variant="outline">{row.hcpRole}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{row.email ?? '—'}</TableCell>
            <TableCell>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={row.isTechnician}
                  disabled={pending}
                  onChange={(e) => toggle(row, 'isTechnician', e.target.checked)}
                  aria-label={`${row.name} is a technician`}
                />
                {row.isTechnician ? 'Yes' : 'No'}
              </label>
            </TableCell>
            <TableCell>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={row.active}
                  disabled={pending}
                  onChange={(e) => toggle(row, 'active', e.target.checked)}
                  aria-label={`${row.name} is active`}
                />
                {row.active ? 'Yes' : 'No'}
              </label>
            </TableCell>
            <TableCell className="text-muted-foreground">{formatApp(row.syncedAt)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No employees synced yet. Run a backfill from the Sync page.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
