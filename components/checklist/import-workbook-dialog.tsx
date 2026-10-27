'use client';

import { FileSpreadsheetIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { SheetSummary } from '@/src/lib/workbook/extract';
import { importWorkbook } from '@/src/server/actions/import-workbook';

/**
 * Upload the Excel workbook (or a CSV of one tab) the team filled in as a fallback and copy its
 * answers into this checklist. When the workbook holds several filled tabs the dialog asks which.
 */
export function ImportWorkbookDialog({ checklistId }: { checklistId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetSummary[] | null>(null);
  const [sheet, setSheet] = useState<string>('');
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function reset() {
    setFile(null);
    setSheets(null);
    setSheet('');
    setProblems([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function submit() {
    if (!file) return;
    const form = new FormData();
    form.set('checklistId', checklistId);
    form.set('file', file);
    if (sheet) form.set('sheet', sheet);
    startTransition(async () => {
      const result = await importWorkbook(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if ('needsSheet' in result) {
        setSheets(result.needsSheet);
        setSheet(result.needsSheet[0]?.name ?? '');
        return;
      }
      const { answers, fields, sheet: used } = result.data;
      toast.success(
        `Imported ${answers} answer${answers === 1 ? '' : 's'} and ${fields} field${fields === 1 ? '' : 's'} from "${used}".`,
      );
      if (result.data.problems.length > 0) {
        setProblems(result.data.problems);
      } else {
        setOpen(false);
        reset();
      }
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="h-9 sm:h-7">
            <FileSpreadsheetIcon data-icon="inline-start" />
            Import workbook
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Import from the workbook</DialogTitle>
            <DialogDescription>
              Upload the Excel checklist (.xlsx) or a CSV of its tab. Answers and header fields that
              are filled in are copied here; everything else is left as it is. You can review and
              change anything before submitting.
            </DialogDescription>
          </DialogHeader>

          {problems.length > 0 ? (
            <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">Imported, but these cells were skipped:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : sheets ? (
            <div className="space-y-1.5">
              <Label>Which tab is this job?</Label>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
                {sheets.map((s) => (
                  <label
                    key={s.name}
                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="radio"
                      name={`${id}-sheet`}
                      value={s.name}
                      checked={sheet === s.name}
                      onChange={() => setSheet(s.name)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.customerName ?? 'No customer name'}
                        {s.projectDate ? ` · ${s.projectDate}` : ''} · {s.answered} answered
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-file`}>File</Label>
              <input
                ref={inputRef}
                id={`${id}-file`}
                type="file"
                accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
              />
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              {problems.length > 0 ? 'Close' : 'Cancel'}
            </DialogClose>
            {problems.length === 0 && (
              <Button type="submit" disabled={pending || !file || (sheets !== null && !sheet)}>
                {pending ? 'Importing…' : sheets ? 'Import this tab' : 'Import'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
