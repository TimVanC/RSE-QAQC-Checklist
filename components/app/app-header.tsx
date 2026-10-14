import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Role } from '@/src/db/schema/enums';
import { ROLE_LABELS, hasRole } from '@/src/lib/auth/roles';
import type { CurrentUser } from '@/src/lib/auth/session';
import { signOutAction } from '@/src/server/actions/auth';
import { NyClock } from './ny-clock';

const NAV: Array<{ href: string; label: string; minimum: Role }> = [
  { href: '/queue', label: 'Call queue', minimum: 'caller' },
  { href: '/tracker', label: 'Completion tracker', minimum: 'manager' },
  { href: '/production', label: 'Production', minimum: 'manager' },
  { href: '/admin', label: 'Admin', minimum: 'admin' },
];

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          RSE QA/QC
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.filter((item) => hasRole(user.role, item.minimum)).map((item) => (
            <Button key={item.href} render={<Link href={item.href} />} variant="ghost" size="sm">
              {item.label}
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <NyClock />
          <span className="hidden sm:inline">{user.name}</span>
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
