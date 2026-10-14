import type { ReactNode } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requirePageRole } from '@/src/lib/auth/session';
import { formatApp } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';
import { getSyncOverview, type SyncRunView } from '@/src/server/queries/sync';
import { SyncActions } from './sync-actions';

export const dynamic = 'force-dynamic';
// Manual reconcile/backfill run inside the server action; match the cron routes' budget.
export const maxDuration = 300;

const TIME_FORMAT = 'MMM d, h:mm:ss a';

const OK_STYLE = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
const PENDING_STYLE = 'border-amber-400 text-amber-700 dark:text-amber-300';

const STATUS_STYLES: Record<string, { variant: 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  ok: { variant: 'secondary', className: OK_STYLE },
  processed: { variant: 'secondary', className: OK_STYLE },
  running: { variant: 'outline', className: 'border-sky-400 text-sky-700 dark:text-sky-300' },
  pending: { variant: 'outline', className: PENDING_STYLE },
  error: { variant: 'destructive' },
  failed: { variant: 'destructive' },
  skipped: { variant: 'secondary' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { variant: 'outline' as const };
  return (
    <Badge variant={style.variant} className={style.className}>
      {status}
    </Badge>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)} m ${totalSeconds % 60} s`;
}

function CountChips({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className={cn(
            'bg-muted rounded px-1.5 py-0.5 font-mono text-xs',
            key.includes('error') && value > 0 && 'bg-destructive/10 text-destructive',
          )}
        >
          {key}={value}
        </span>
      ))}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="text-destructive max-w-sm truncate" title={error}>
      {error}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <span className="text-muted-foreground text-xs">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">{children}</div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bg-card rounded-lg border px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString('en-US')}</div>
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function LastOkSummary({ run }: { run: SyncRunView | null }) {
  if (!run) return <span className="text-muted-foreground">No successful sync yet</span>;
  const at = run.finishedAt ?? run.startedAt;
  return (
    <>
      <span className="font-medium">{formatApp(at, 'MMM d, yyyy h:mm a')}</span>
      <span className="text-muted-foreground">
        {' '}
        ({formatDistanceToNowStrict(at, { addSuffix: true })}) · {run.kind}, {run.trigger}
      </span>
    </>
  );
}

export default async function AdminSyncPage() {
  await requirePageRole('admin');
  const overview = await getSyncOverview();
  const { counts } = overview;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Housecall Pro sync</h1>
        <p className="text-muted-foreground text-sm">
          Sync runs, webhook deliveries and manual controls. Times are New Jersey time.
        </p>
      </div>

      <Section title="Connection">
        <div className="space-y-4 rounded-lg border p-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Housecall Pro API key">
              {overview.hcpConfigured ? (
                <Badge variant="secondary" className={OK_STYLE}>
                  configured
                </Badge>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">not set</Badge>
                  <span className="text-muted-foreground text-xs">Syncs are disabled until HCP_API_KEY is set.</span>
                </span>
              )}
            </Fact>
            <Fact label="Last successful sync">
              <LastOkSummary run={overview.lastOkRun} />
            </Fact>
            <Fact label="Webhook events pending or failed">
              {overview.pendingWebhooks > 0 ? (
                <Badge variant="outline" className={PENDING_STYLE}>
                  {overview.pendingWebhooks}
                </Badge>
              ) : (
                <span className="tabular-nums">0</span>
              )}
            </Fact>
          </dl>
          <SyncActions pendingWebhooks={overview.pendingWebhooks} />
        </div>
      </Section>

      <Section title="Data in database">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Jobs" value={counts.jobs} />
          <Tile
            label="Technicians"
            value={counts.technicians}
            hint={`${counts.techniciansFlagged.toLocaleString('en-US')} flagged as technician`}
          />
          <Tile label="Customers" value={counts.customers} />
          <Tile label="Invoices" value={counts.invoices} />
        </div>
      </Section>

      <Section title="Sync runs" description={`Latest ${overview.runs.length}, newest first`}>
        {overview.runs.length === 0 ? (
          <Empty>No sync runs yet. Runs appear here after the first cron run or a manual run.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Started</TableHead>
                  <TableHead className="h-8 text-xs">Kind</TableHead>
                  <TableHead className="h-8 text-xs">Trigger</TableHead>
                  <TableHead className="h-8 text-xs">Status</TableHead>
                  <TableHead className="h-8 text-right text-xs">Duration</TableHead>
                  <TableHead className="h-8 text-xs">Counts</TableHead>
                  <TableHead className="h-8 text-xs">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="py-1.5 tabular-nums">{formatApp(run.startedAt, TIME_FORMAT)}</TableCell>
                    <TableCell className="py-1.5">{run.kind}</TableCell>
                    <TableCell className="py-1.5">{run.trigger}</TableCell>
                    <TableCell className="py-1.5">
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{formatDuration(run.durationMs)}</TableCell>
                    <TableCell className="py-1.5 whitespace-normal">
                      <CountChips counts={run.counts} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <ErrorText error={run.error} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Webhook events" description={`Latest ${overview.webhookEvents.length}, newest first`}>
        {overview.webhookEvents.length === 0 ? (
          <Empty>No webhook events received yet. Deliveries from Housecall Pro appear here.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Received</TableHead>
                  <TableHead className="h-8 text-xs">Event</TableHead>
                  <TableHead className="h-8 text-xs">Status</TableHead>
                  <TableHead className="h-8 text-right text-xs">Attempts</TableHead>
                  <TableHead className="h-8 text-xs">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.webhookEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="py-1.5 tabular-nums">{formatApp(event.receivedAt, TIME_FORMAT)}</TableCell>
                    <TableCell className="py-1.5 font-mono text-xs">{event.event}</TableCell>
                    <TableCell className="py-1.5">
                      <StatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{event.attempts}</TableCell>
                    <TableCell className="py-1.5">
                      <ErrorText error={event.error} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
