import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageRole } from '@/src/lib/auth/session';
import { periodForDate } from '@/src/lib/pay-periods';
import { compareDates, todayAppDate } from '@/src/lib/time';
import { getPayPeriodRule, listPayPeriods } from '@/src/server/queries/pay-periods';
import { GeneratePeriods } from './generate-periods';
import { PeriodsTable } from './periods-table';
import { PayPeriodRuleForm } from './rule-form';

export const dynamic = 'force-dynamic';

export default async function AdminPayPeriodsPage() {
  await requirePageRole('admin');
  const [rule, periods] = await Promise.all([getPayPeriodRule(), listPayPeriods()]);
  const today = todayAppDate();
  const current = periodForDate(rule, today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pay periods</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Pay periods decide which jobs a technician must have submitted checklists for. Default is
          biweekly from Monday July 6, 2026 (go-live) until Ron confirms.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rule</CardTitle>
            <CardDescription>
              Under this rule, today falls in{' '}
              <span className="text-foreground">{current.label}</span>. Changing the rule does not
              change periods already stored; delete those and generate again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayPeriodRuleForm cadence={rule.cadence} anchor={rule.anchor} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Generate periods</CardTitle>
            <CardDescription>
              Stores every period from one month ago to the chosen number of months ahead, using the
              saved rule. Periods already stored are kept.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GeneratePeriods />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-semibold">Stored periods</h2>
          <span className="text-xs text-muted-foreground">
            {periods.length} stored. Dates without a stored period use the rule.
          </span>
        </div>
        <PeriodsTable
          periods={periods.map((p) => ({
            id: p.id,
            label: p.label,
            startDate: p.startDate,
            endDate: p.endDate,
            current: compareDates(p.startDate, today) <= 0 && compareDates(today, p.endDate) <= 0,
          }))}
        />
      </section>
    </div>
  );
}
