'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

const ADMIN_NAV = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/technicians', label: 'Technicians' },
  { href: '/admin/pay-periods', label: 'Pay periods' },
  { href: '/admin/sync', label: 'Sync' },
  { href: '/admin/export', label: 'Export' },
];

/** Admin sub-navigation; on narrow screens it scrolls sideways (no visible scrollbar) instead of wrapping. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Admin"
      className="-mx-4 flex [scrollbar-width:none] items-center gap-1 overflow-x-auto overscroll-x-contain border-b px-4 pb-3 text-sm sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {ADMIN_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Button
            key={item.href}
            render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
            nativeButton={false}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            className={
              active ? 'h-10 rounded-full font-semibold sm:h-7' : 'h-10 rounded-full sm:h-7'
            }
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
