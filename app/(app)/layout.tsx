import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { requireUser } from '@/src/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
