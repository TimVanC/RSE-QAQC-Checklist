'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  creditShares,
  rolesNeeded,
  sharePercent,
  TECHNICIAN_ROLE_LABELS,
} from '@/src/lib/job-roles';
import { cn } from '@/src/lib/utils';
import { setLeadTechnician } from '@/src/server/actions/job-roles';
import type { WorkspaceTechnician } from './types';

export interface TechnicianRolesProps {
  hcpJobId: string;
  technicians: WorkspaceTechnician[];
  readOnly: boolean;
}

/**
 * Who led a shared job. One tap on a name makes them the lead and everyone else an assistant;
 * tapping the current lead again clears the roles. Only shown when a job has several technicians,
 * since a lone technician always gets full credit.
 */
export function TechnicianRoles({ hcpJobId, technicians, readOnly }: TechnicianRolesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leadId, setLeadId] = useState<string | null>(
    technicians.find((t) => t.role === 'lead')?.id ?? null,
  );
  if (technicians.length < 2) return null;

  const assignees = technicians.map((t) => ({
    technicianId: t.id,
    role: leadId === null ? null : t.id === leadId ? ('lead' as const) : ('assistant' as const),
  }));
  const shares = new Map(creditShares(assignees).map((s) => [s.technicianId, s.share]));
  const needed = rolesNeeded(assignees);

  function choose(id: string) {
    const next = id === leadId ? null : id;
    const before = leadId;
    setLeadId(next);
    startTransition(async () => {
      const result = await setLeadTechnician({ hcpJobId, leadTechnicianId: next });
      if (!result.ok) {
        setLeadId(before);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t pt-3" data-technician-roles>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-xs text-muted-foreground">Lead technician</div>
        {needed ? (
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            Roles not set
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            Production credit: lead 60%, assistant 40%
          </span>
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {technicians.map((t) => {
          const role = assignees.find((a) => a.technicianId === t.id)?.role ?? null;
          const share = shares.get(t.id) ?? 0;
          return (
            <li key={t.id}>
              <Button
                type="button"
                variant={role === 'lead' ? 'default' : 'outline'}
                size="sm"
                className={cn('h-10 sm:h-8', role === 'lead' && 'ring-2 ring-primary/30')}
                aria-pressed={role === 'lead'}
                disabled={readOnly || pending}
                onClick={() => choose(t.id)}
                data-role-button={t.id}
                title={
                  readOnly
                    ? undefined
                    : role === 'lead'
                      ? 'Tap again to clear the roles'
                      : `Mark ${t.name} as the lead`
                }
              >
                <span className="font-medium">{t.name}</span>
                <span
                  className={cn(
                    'text-xs',
                    role === 'lead' ? 'opacity-90' : 'text-muted-foreground',
                  )}
                >
                  {role ? TECHNICIAN_ROLE_LABELS[role] : 'No role'} · {sharePercent(share)}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
