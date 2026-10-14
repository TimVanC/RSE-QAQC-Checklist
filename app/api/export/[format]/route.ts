import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, UnauthenticatedError, requireRole } from '@/src/lib/auth/session';
import {
  EXPORT_DATASETS,
  exportFilename,
  isExportDataset,
  isExportFormat,
  type ExportDataset,
} from '@/src/lib/export/catalog';
import { csvChunks } from '@/src/lib/export/csv';
import { DATASETS, exportAll } from '@/src/lib/export/datasets';
import { jsonChunks, toByteStream } from '@/src/lib/export/stream';
import { todayAppDate } from '@/src/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin data export (supports RSE's data ownership commitment).
 *
 *   GET /api/export/csv?dataset=checklists|answers|jobs|technicians|pay_periods|users|audit_log
 *   GET /api/export/json[?dataset=...]   everything, or one dataset
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ format: string }> },
) {
  try {
    await requireRole('admin');
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    throw err;
  }

  const { format } = await params;
  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: `unknown export format "${format}"; use csv or json` },
      { status: 404 },
    );
  }

  const requested = request.nextUrl.searchParams.get('dataset');
  const datasetsHint = `dataset must be one of: ${EXPORT_DATASETS.join(', ')}`;
  let dataset: ExportDataset | null = null;
  if (requested !== null) {
    if (!isExportDataset(requested)) {
      return NextResponse.json(
        { error: `unknown dataset "${requested}"; ${datasetsHint}` },
        { status: 400 },
      );
    }
    dataset = requested;
  } else if (format === 'csv') {
    return NextResponse.json(
      { error: `dataset is required for csv; ${datasetsHint}` },
      { status: 400 },
    );
  }

  let chunks: Iterable<string>;
  try {
    if (format === 'csv') {
      const definition = DATASETS[dataset as ExportDataset];
      chunks = csvChunks(await definition.load(), definition.columns, { bom: true });
    } else if (dataset) {
      chunks = jsonChunks({
        exported_at: new Date().toISOString(),
        [dataset]: await DATASETS[dataset].load(),
      });
    } else {
      chunks = jsonChunks({ ...(await exportAll()) });
    }
  } catch (err) {
    console.error('data export failed', err);
    return NextResponse.json({ error: 'export failed' }, { status: 500 });
  }

  const filename = exportFilename(dataset ?? 'all', format, todayAppDate());
  return new Response(toByteStream(chunks), {
    headers: {
      'Content-Type':
        format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
