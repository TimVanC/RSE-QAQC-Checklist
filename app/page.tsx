import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">RSE QA/QC Production Checklist</h1>
      <p className="text-muted-foreground">
        Status: project scaffold is in place; checklist features are not built yet.
      </p>
      <Button disabled>Call queue (coming soon)</Button>
    </main>
  );
}
