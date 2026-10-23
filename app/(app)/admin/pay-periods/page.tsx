import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageRole } from '@/src/lib/auth/session';
import { periodForDate } from '@/src/lib/pay-periods';
import { todayAppDate } from '@/src/lib/time';
import { getPayPeriodRule } from '@/src/server/queries/pay-periods';
import { getTrackingStartDate } from '@/src/server/queries/settings';
import { PayPeriodRuleForm } from './rule-form';
import { TrackingStartForm } from './tracking-start-form';

export const dynamic = 'force-dynamic';

export default async function AdminPayPeriodsPage() {
  await requirePageRole('admin');
  const [rule, trackingStart] = await Promise.all([getPayPeriodRule(), getTrackingStartDate()]);
  const current = periodForDate(rule, todayAppDate());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pay periods</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Checklists must be submitted before the end of each pay period to validate pay. The Completion
          tracker and Production pages group jobs by these periods. Set how often RSE pays and the first day of
          any one period; every other period follows from that.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pay schedule</CardTitle>
            <CardDescription>
              Today falls in <span className="text-foreground">{current.label}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayPeriodRuleForm cadence={rule.cadence} anchor={rule.anchor} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tracking start</CardTitle>
            <CardDescription>
              The first day the tracker counts. Jobs before it were handled in the old workbooks and are not shown
              as missing. Leave blank to count every job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrackingStartForm date={trackingStart} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
