import { MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react';
import { formatPhone, telHref, whatsappHref } from '@/src/lib/contact';
import { cn } from '@/src/lib/utils';

export interface TechContactProps {
  mobile: string | null | undefined;
  email?: string | null;
  /** Owner's name, for the accessible labels. */
  name: string;
  className?: string;
}

const LINK =
  'inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground';

/**
 * A technician's phone and email as tap-to-call, WhatsApp and mail links. Renders nothing when
 * Housecall Pro has no contact details for them. Plain links, so it works in server components.
 */
export function TechContact({ mobile, email, name, className }: TechContactProps) {
  const phone = formatPhone(mobile);
  const tel = telHref(mobile);
  const wa = whatsappHref(mobile);
  if (!phone && !email) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-x-1 gap-y-0.5 font-normal', className)}>
      {phone && tel && (
        <a href={tel} className={LINK} aria-label={`Call ${name} at ${phone}`}>
          <PhoneIcon className="size-3.5" aria-hidden />
          <span className="tabular-nums">{phone}</span>
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
          aria-label={`Message ${name} on WhatsApp`}
          title="WhatsApp"
        >
          <MessageCircleIcon className="size-3.5" aria-hidden />
          WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={LINK} aria-label={`Email ${name} at ${email}`}>
          <MailIcon className="size-3.5" aria-hidden />
          <span className="break-all">{email}</span>
        </a>
      )}
    </span>
  );
}
