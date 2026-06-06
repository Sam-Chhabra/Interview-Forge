'use client';

import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    // Resume parse statuses
    pending: 'bg-zinc-100 text-zinc-700',
    processing: 'bg-blue-100 text-blue-700 animate-pulse',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    // Interview session statuses
    not_started: 'bg-zinc-100 text-zinc-700',
    in_progress: 'bg-amber-100 text-amber-700',
    abandoned: 'bg-zinc-100 text-zinc-500',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status] || 'bg-zinc-100 text-zinc-700',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
