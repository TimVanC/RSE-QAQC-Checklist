'use client';

import { useRouter } from 'next/navigation';

/** Technician filter for the tracker; keeps the selected period. */
export function TechnicianFilter({
  technicians,
  value,
  period,
}: {
  technicians: Array<{ id: string; name: string }>;
  value: string;
  period: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Technician"
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams({ period });
        if (e.target.value) params.set('technician', e.target.value);
        router.push(`/tracker?${params.toString()}`);
      }}
      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
    >
      <option value="">All technicians</option>
      {technicians.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
