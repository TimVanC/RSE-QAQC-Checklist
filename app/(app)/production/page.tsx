import { PeriodSelect } from '@/components/periods/period-select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePageRole } from '@/src/lib/auth/session';
import { cn } from '@/src/lib/utils';
import { getPeriodNavigation } from '@/src/server/queries/pay-periods';
import { getProduction, type ProductionLine } from '@/src/server/queries/production';

export const dynamic = 'force-dynamic';

function pct(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

const NUM = 'text-right tabular-nums';

function Cells({ line }: { line: ProductionLine }) {
  const r = line.rollup;
  return (
    <>
      <TableCell className={NUM}>{r.total_service_quotes}</TableCell>
      <TableCell className={NUM}>{r.total_in_progress}</TableCell>
      <TableCell className={NUM}>{r.total_completed}</TableCell>
      <TableCell className={NUM}>{r.callbacks}</TableCell>
      <TableCell className={NUM}>{pct(r.approved_pct)}</TableCell>
      <TableCell className={NUM}>{pct(r.declined_pct)}</TableCell>
      <TableCell className={NUM}>{pct(r.in_progress_pct)}</TableCell>
      <TableCell className={NUM}>{pct(r.completed_pct)}</TableCell>
      <TableCell className={NUM}>{r.black}</TableCell>
      <TableCell className={cn(NUM, r.red > 0 && 'text-destructive')}>{r.red}</TableCell>
      <TableCell className={NUM}>{pct(r.bottom_line_pct)}</TableCell>
      <TableCell className={NUM}>
        {line.submitted}
        <span className="ml-1 text-xs font-normal text-muted-foreground">of {line.checklists}</span>
      </TableCell>
    </>
  );
}

const HEADERS: Array<{ label: string; title: string }> = [
  { label: 'Service quotes', title: 'Task checklists with step 2 = Y (workbook D9)' },
  { label: 'In progress', title: 'Step 17 = Y minus completed (workbook D10)' },
  { label: 'Completed', title: 'Step 34 = Y (workbook D11)' },
  { label: 'Call backs', title: 'Call back checklists; not part of the other figures' },
  { label: 'Approved %', title: '(In progress + Completed) / Service quotes (D14)' },
  { label: 'Declined %', title: '100 - Approved % (D15)' },
  { label: 'In progress %', title: 'In progress / Service quotes (D16)' },
  { label: 'Completed %', title: 'Completed / Service quotes (D17)' },
  { label: 'Black', title: 'Perfect tasks: completed with no failure flags (B20)' },
  { label: 'Red', title: 'Tasks with at least one failure flag (B21)' },
  { label: 'Bottom line %', title: 'Black / (Black + Red) (B23)' },
  { label: 'Submitted', title: 'Submitted checklists (task and call back) of all checklists' },
];

export default async function ProductionPage(props: PageProps<'/production'>) {
  await requirePageRole('manager');
  const { period: rawPeriod } = await props.searchParams;
  const nav = await getPeriodNavigation(typeof rawPeriod === 'string' ? rawPeriod : undefined);
  const { period } = nav;
  const production = await getProduction(period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Production</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{period.label}</span> · checklists by call
            date
            {!period.id && ' · computed from the pay period rule'}
          </p>
        </div>
        <PeriodSelect
          basePath="/production"
          value={period.start_date}
          currentStart={nav.currentStart}
          options={nav.options}
          prev={nav.prev}
          next={nav.next}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Technician</TableHead>
              {HEADERS.map((h) => (
                <TableHead key={h.label} className="text-right" title={h.title}>
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {production.rows.map((line) => (
              <TableRow
                key={line.technicianId ?? 'none'}
                className={cn(line.checklists === 0 && 'text-muted-foreground')}
              >
                <TableCell className="font-medium">{line.name}</TableCell>
                <Cells line={line} />
              </TableRow>
            ))}
            {production.rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={HEADERS.length + 1}
                  className="text-center text-muted-foreground"
                >
                  No technicians yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <Cells line={production.totals} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {production.totals.checklists === 0 && (
        <p className="text-sm">No checklists have a call date in {period.label} yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Figures follow the Excel workbook formulas: task checklists only; call backs are counted
        separately.
      </p>
    </div>
  );
}
