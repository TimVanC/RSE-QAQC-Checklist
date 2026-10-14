'use client';

import { KeyboardIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['↓', 'j'], action: 'Next step' },
  { keys: ['↑', 'k'], action: 'Previous step' },
  { keys: ['Home', 'End'], action: 'First / last step' },
  { keys: ['y', 'n', 'b'], action: 'Answer Y / N / B and move to the next step' },
  { keys: ['Backspace', 'Del'], action: 'Clear the answer' },
  { keys: ['Enter'], action: 'Next step; on the last step, go to Submit' },
  { keys: ['Esc'], action: 'Leave a step’s date/text field' },
  { keys: ['?'], action: 'Show or hide this list' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[0.7rem] text-foreground">
      {children}
    </kbd>
  );
}

export function ShortcutsPopover({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" aria-label="Keyboard shortcuts" />}
      >
        <KeyboardIcon />?
      </PopoverTrigger>
      {/* Opening with ? keeps focus on the current step, so ? or Esc closes it and keys keep working. */}
      <PopoverContent align="end" className="w-80" initialFocus={false} finalFocus={false}>
        <PopoverHeader>
          <PopoverTitle>Keyboard shortcuts</PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Click a step (or press j) to start. Keys are ignored while typing in a field.
          </p>
        </PopoverHeader>
        <ul className="space-y-1.5 text-xs">
          {SHORTCUTS.map((s) => (
            <li key={s.action} className="flex items-start justify-between gap-3">
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              <span className="text-right text-muted-foreground">{s.action}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
