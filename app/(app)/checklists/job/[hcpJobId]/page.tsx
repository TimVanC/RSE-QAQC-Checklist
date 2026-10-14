import { redirect } from 'next/navigation';
import { requireUser } from '@/src/lib/auth/session';
import { openChecklistForJob } from '@/src/server/actions/checklists';

export const dynamic = 'force-dynamic';

/**
 * Entry point from the call queue: find or create the Appointment/Service Call checklist for a
 * Housecall Pro job, refresh its auto-check suggestions, then open it.
 */
export default async function OpenChecklistForJobPage({ params }: { params: Promise<{ hcpJobId: string }> }) {
  await requireUser();
  const { hcpJobId } = await params;
  const result = await openChecklistForJob(hcpJobId);
  if (!result.ok) {
    redirect(`/queue?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/checklists/${result.data.id}`);
}
