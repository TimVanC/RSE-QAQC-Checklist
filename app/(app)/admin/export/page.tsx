import { Download, FileJson } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageRole } from '@/src/lib/auth/session';
import { DATASET_INFO, EXPORT_DATASETS } from '@/src/lib/export/catalog';

export const dynamic = 'force-dynamic';

/** A real link (not a button) so the browser downloads the file and assistive tech announces a link. */
function DownloadLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: 'default' | 'outline';
  children: string;
}) {
  return (
    <a href={href} download className={buttonVariants({ variant })}>
      <Download data-icon="inline-start" aria-hidden />
      {children}
    </a>
  );
}

export default async function AdminExportPage() {
  await requirePageRole('admin');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Data export</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The checklists, answers, scores and audit trail in this app belong to RSE Energy Group.
          Download them at any time as CSV (opens in Excel) or as one complete JSON file. Files are
          generated live when you click, so they always reflect the current data.
        </p>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Timestamps are ISO 8601 in UTC. Calendar dates (call date, project date, permit dates) are
          New Jersey days. People appear by name. Housecall Pro raw payloads are not included;
          Housecall Pro remains the record for those.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="size-4" aria-hidden />
            Download everything (JSON)
          </CardTitle>
          <CardDescription>
            One file with every dataset below: checklists, answers, jobs, technicians, pay periods,
            users and the audit log, plus the export time.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <DownloadLink href="/api/export/json" variant="default">
            Download JSON
          </DownloadLink>
        </CardFooter>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {EXPORT_DATASETS.map((dataset) => {
          const info = DATASET_INFO[dataset];
          return (
            <Card key={dataset}>
              <CardHeader>
                <CardTitle>{info.title}</CardTitle>
                <CardDescription>{info.description}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <DownloadLink href={`/api/export/csv?dataset=${dataset}`} variant="outline">
                  Download CSV
                </DownloadLink>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
