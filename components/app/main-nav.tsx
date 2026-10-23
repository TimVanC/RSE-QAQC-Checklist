'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { Role } from '@/src/db/schema/enums';
import { hasRole } from '@/src/lib/auth/roles';
import { cn } from '@/src/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  minimum: Role;
  also?: string[];
}

const NAV: NavItem[] = [
  { href: '/queue', label: 'Call queue', minimum: 'caller', also: ['/checklists'] },
  { href: '/tracker', label: 'Completion tracker', minimum: 'manager' },
  { href: '/production', label: 'Production', minimum: 'manager' },
  { href: '/admin', label: 'Admin', minimum: 'admin' },
];

/** The sections this role may open, in menu order. */
export function navItemsFor(role: Role): NavItem[] {
  return NAV.filter((item) => hasRole(role, item.minimum));
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  const roots = [item.href, ...(item.also ?? [])];
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/** Main navigation; the current section gets a filled, rounded background. */
export function MainNav({ role, className }: { role: Role; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cn('flex items-center gap-2 text-sm', className)}>
      {navItemsFor(role).map((item) => {
        const active = isNavActive(pathname, item);
        return (
          <Button
            key={item.href}
            render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
            nativeButton={false}
            variant={active ? 'secondary' : 'ghost'}
            className={active ? 'rounded-full px-3 font-semibold' : 'rounded-full px-3'}
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
