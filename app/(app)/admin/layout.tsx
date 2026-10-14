import type { ReactNode } from 'react';
import { AdminNav } from '@/components/app/admin-nav';
import { requirePageRole } from '@/src/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole('admin');
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
