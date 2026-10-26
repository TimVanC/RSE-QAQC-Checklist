'use client';

import { LifeBuoyIcon, LogOutIcon, MenuIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SUPPORT_MAILTO } from '@/src/config/support';
import type { Role } from '@/src/db/schema/enums';
import { cn } from '@/src/lib/utils';
import { signOutAction } from '@/src/server/actions/auth';
import { isNavActive, navItemsFor } from './main-nav';
import { BrandLogo } from './brand-logo';
import { NyClock } from './ny-clock';

/** Menu sheet for phones and tablets: the role's sections, the account link and Sign out. */
export function MobileNav({
  role,
  roleLabel,
  name,
}: {
  role: Role;
  roleLabel: string;
  name: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const accountActive = pathname === '/account';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="icon-lg" aria-label="Open menu" />}>
        <MenuIcon className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[85%] max-w-xs gap-0">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            <BrandLogo className="h-8" />
            <span className="sr-only">RSE QA/QC</span>
          </SheetTitle>
          <SheetDescription render={<div />}>
            <NyClock />
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Main menu" className="flex flex-col gap-1 p-3">
          {navItemsFor(role).map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={close}
                className={cn(
                  buttonVariants({ variant: active ? 'secondary' : 'ghost' }),
                  'h-11 justify-start px-3 text-base',
                  active && 'font-semibold',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Separator />

        <div className="flex flex-col gap-2 p-3">
          <Link
            href="/account"
            onClick={close}
            aria-current={accountActive ? 'page' : undefined}
            title="Your account and password"
            className={cn(
              buttonVariants({ variant: accountActive ? 'secondary' : 'ghost' }),
              'h-11 justify-start gap-2 px-3 text-base',
            )}
          >
            <UserIcon />
            <span className="min-w-0 truncate">{name}</span>
          </Link>
          <div className="flex items-center gap-2 px-3 text-sm text-muted-foreground">
            Role <Badge variant="secondary">{roleLabel}</Badge>
          </div>
          <a
            href={SUPPORT_MAILTO}
            title="Email Tim about a problem with the app"
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'h-11 justify-start gap-2 px-3 text-base',
            )}
          >
            <LifeBuoyIcon />
            Support
          </a>
        </div>

        <div className="mt-auto border-t p-3">
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="h-11 w-full text-base">
              <LogOutIcon data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
