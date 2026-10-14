import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/src/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
        <p className="text-muted-foreground text-sm">
          Nightly QA/QC checklists for RSE Energy Group. All dates are New Jersey time.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Call queue</CardTitle>
            <CardDescription>Today&apos;s jobs by technician with checklist status.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Coming in the next change.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Checklists</CardTitle>
            <CardDescription>Appointment/Service Call and Call Back checklists.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Coming in the next change.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Housecall Pro sync</CardTitle>
            <CardDescription>Jobs, technicians and invoices, refreshed automatically.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Coming in the next change.</CardContent>
        </Card>
      </div>
    </div>
  );
}
