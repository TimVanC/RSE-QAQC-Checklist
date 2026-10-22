import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/src/lib/auth/roles';
import type { CurrentUser } from '@/src/lib/auth/session';
import { signOutAction } from '@/src/server/actions/auth';
import { MainNav } from './main-nav';
import { NyClock } from './ny-clock';

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          RSE QA/QC
        </Link>
        <MainNav role={user.role} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <NyClock />
          <Link href="/account" className="hidden underline-offset-4 hover:underline sm:inline" title="Your account and password">
            {user.name}
          </Link>
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
