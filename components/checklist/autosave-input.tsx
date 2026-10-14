'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Local-state text/date control that saves itself: debounced while typing, immediately on blur
 * (and on Enter for single-line inputs). A failed save restores the last saved value unless the
 * user has typed something newer in the meantime.
 */
function useAutosave({
  initialValue,
  onSave,
  onSaved,
  debounceMs,
  required,
}: {
  initialValue: string;
  onSave: (value: string) => Promise<boolean>;
  onSaved?: (value: string) => void;
  debounceMs: number;
  required?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const savedRef = useRef(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  const savedCbRef = useRef(onSaved);

  useEffect(() => {
    saveRef.current = onSave;
    savedCbRef.current = onSaved;
  }, [onSave, onSaved]);

  const commit = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = valueRef.current;
    if (v === savedRef.current) return;
    if (required && v.trim() === '') {
      valueRef.current = savedRef.current;
      setValue(savedRef.current);
      return;
    }
    const before = savedRef.current;
    savedRef.current = v;
    const ok = await saveRef.current(v);
    if (ok) {
      savedCbRef.current?.(v);
      return;
    }
    savedRef.current = before;
    if (valueRef.current === v) {
      valueRef.current = before;
      setValue(before);
    }
  }, [required]);

  const change = useCallback(
    (v: string) => {
      valueRef.current = v;
      setValue(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void commit(), debounceMs);
    },
    [commit, debounceMs],
  );

  // Flush a pending edit when the control unmounts (e.g. navigating away mid-debounce).
  useEffect(() => {
    const timer = timerRef;
    return () => {
      if (timer.current) void commit();
    };
  }, [commit]);

  return { value, change, commit };
}

type BaseInputProps = Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange'>;

export interface AutosaveInputProps extends BaseInputProps {
  initialValue: string;
  onSave: (value: string) => Promise<boolean>;
  onSaved?: (value: string) => void;
  debounceMs?: number;
  /** Empty values are not saved; the last saved value is restored instead. */
  required?: boolean;
}

export function AutosaveInput({
  initialValue,
  onSave,
  onSaved,
  debounceMs = 500,
  required,
  onBlur,
  onKeyDown,
  ...props
}: AutosaveInputProps) {
  const { value, change, commit } = useAutosave({
    initialValue,
    onSave,
    onSaved,
    debounceMs,
    required,
  });
  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        void commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void commit();
        }
        onKeyDown?.(e);
      }}
    />
  );
}

type BaseTextareaProps = Omit<ComponentProps<'textarea'>, 'value' | 'defaultValue' | 'onChange'>;

export interface AutosaveTextareaProps extends BaseTextareaProps {
  initialValue: string;
  onSave: (value: string) => Promise<boolean>;
  debounceMs?: number;
}

export function AutosaveTextarea({
  initialValue,
  onSave,
  debounceMs = 800,
  onBlur,
  ...props
}: AutosaveTextareaProps) {
  const { value, change, commit } = useAutosave({ initialValue, onSave, debounceMs });
  return (
    <Textarea
      {...props}
      value={value}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        void commit();
        onBlur?.(e);
      }}
    />
  );
}
