import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChecklistWorkspace } from '@/components/checklist/checklist-workspace';
import { requireUser } from '@/src/lib/auth/session';
import { getChecklistDetail } from '@/src/server/queries/checklists';
import { serializeChecklistDetail } from './serialize';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checklist · RSE QA/QC',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const detail = await getChecklistDetail(id);
  if (!detail) notFound();

  const data = serializeChecklistDetail(detail);
  const { checklist } = data;
  // Remount the client workspace when the server state changes underneath it (submit, reopen),
  // so router.refresh() hands it fresh answers instead of stale local state.
  const stateKey = [
    checklist.id,
    checklist.status,
    checklist.submittedAt,
    checklist.reopenedAt,
  ].join(':');

  return (
    <ChecklistWorkspace
      key={stateKey}
      data={data}
      currentUser={{ id: user.id, name: user.name, role: user.role }}
    />
  );
}
