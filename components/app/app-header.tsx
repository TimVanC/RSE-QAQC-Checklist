import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/src/lib/auth/roles';
import type { CurrentUser } from '@/src/lib/auth/session';
import { signOutAction } from '@/src/server/actions/auth';
import { SUPPORT_MAILTO } from '@/src/config/support';
import { BrandLogo } from './brand-logo';
import { MainNav } from './main-nav';
import { MobileNav } from './mobile-nav';
import { NyClock } from './ny-clock';

/**
 * Full bar from `lg` up (brand, section pills, clock, account, Sign out). Below `lg` the four
 * section pills plus the account controls do not fit, so the bar keeps the brand and a menu
 * button, and the sections and account live in a side sheet.
 */
export function AppHeader({ user }: { user: CurrentUser }) {
  const roleLabel = ROLE_LABELS[user.role];
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6 lg:gap-8 lg:py-4">
        <Link href="/" className="shrink-0" aria-label="RSE QA/QC home">
          <BrandLogo priority className="h-8 lg:h-9" />
        </Link>
        <MainNav role={user.role} className="hidden lg:flex" />

        <div className="ml-auto hidden min-w-0 items-center gap-3 text-sm lg:flex">
          <span className="hidden xl:inline">
            <NyClock />
          </span>
          <Link
            href="/account"
            className="max-w-48 truncate underline-offset-4 hover:underline"
            title="Your account and password"
          >
            {user.name}
          </Link>
          <Badge variant="secondary">{roleLabel}</Badge>
          <a
            href={SUPPORT_MAILTO}
            className="underline-offset-4 hover:underline"
            title="Email Tim about a problem with the app"
          >
            Support
          </a>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>

        <div className="ml-auto flex items-center gap-3 lg:hidden">
          <span className="hidden text-sm sm:inline">
            <NyClock />
          </span>
          <MobileNav role={user.role} roleLabel={roleLabel} name={user.name} />
        </div>
      </div>
    </header>
  );
}
