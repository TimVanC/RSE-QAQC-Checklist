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

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex items-center gap-1 border-b pb-3 text-sm">
      {ADMIN_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Button
            key={item.href}
            render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}
            nativeButton={false}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
          >
            {item.label}
          </Button>
        );
      })}
    </nav>
  );
}
