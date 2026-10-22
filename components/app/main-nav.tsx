'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { Role } from '@/src/db/schema/enums';
import { hasRole } from '@/src/lib/auth/roles';

const NAV: Array<{ href: string; label: string; minimum: Role; also?: string[] }> = [
  { href: '/queue', label: 'Call queue', minimum: 'caller', also: ['/checklists'] },
  { href: '/tracker', label: 'Completion tracker', minimum: 'manager' },
  { href: '/production', label: 'Production', minimum: 'manager' },
  { href: '/admin', label: 'Admin', minimum: 'admin' },
];

function isActive(pathname: string, item: (typeof NAV)[number]): boolean {
  const roots = [item.href, ...(item.also ?? [])];
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/** Main navigation; the current section gets a filled, rounded background. */
export function MainNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {NAV.filter((item) => hasRole(role, item.minimum)).map((item) => {
        const active = isActive(pathname, item);
        return (
          <Button
            key={item.href}
            render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
            nativeButton={false}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            className={active ? 'rounded-full font-semibold' : 'rounded-full'}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
