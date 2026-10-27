import { ClipboardListIcon } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { stepLabel } from '@/src/lib/corrective-actions';
import type { OpenActionEntry } from '@/src/server/queries/corrective-actions';
import { ActionItem, type ActionItemData } from './corrective-actions';

function toItem(a: OpenActionEntry): ActionItemData {
  return {
    id: a.id,
    stepKey: a.stepKey,
    description: a.description,
    owner: a.owner,
    dueDate: a.dueDate,
    status: a.status,
    resolutionNote: a.resolutionNote,
    createdAt: a.createdAt.toISOString(),
    createdByName: a.createdByName,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    resolvedByName: a.resolvedByName,
  };
}

/** Every unresolved follow-up across all jobs, for the tracker. Server component. */
export function OpenActionsCard({
  actions,
  canResolve,
}: {
  actions: OpenActionEntry[];
  canResolve: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardListIcon className="size-4" aria-hidden />
          Open actions
          <span className="text-xs font-normal text-muted-foreground">
            {actions.length === 0
              ? 'Nothing outstanding'
              : `${actions.length} follow-up${actions.length === 1 ? '' : 's'} across all jobs`}
          </span>
        </CardTitle>
      </CardHeader>
      {actions.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {actions.map((a) => (
              <ActionItem
                key={a.id}
                action={toItem(a)}
                canResolve={canResolve}
                lead={
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <Link
                      href={`/checklists/${a.checklistId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {a.customerName || 'Unknown customer'}
                      {a.invoiceNumber ? ` #${a.invoiceNumber}` : ''}
                    </Link>
                    {a.technicianName && <span>{a.technicianName}</span>}
                    <span>{a.callDate}</span>
                    <span className="basis-full sm:basis-auto">{stepLabel(a.stepKey)}</span>
                  </div>
                }
              />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
