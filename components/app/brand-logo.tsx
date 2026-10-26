import Image from 'next/image';
import { cn } from '@/src/lib/utils';

/** The RSE QA/QC wordmark (public/brand/logo.png, 1200x384). Height sets the size; width follows. */
export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="RSE QA/QC"
      width={1200}
      height={384}
      priority={priority}
      className={cn('h-8 w-auto', className)}
    />
  );
}
