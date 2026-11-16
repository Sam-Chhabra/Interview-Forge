'use client';

import { cn } from '@/lib/utils';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    processing: 'bg-blue-500/15 text-blue-400 animate-pulse',
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-red-500/15 text-red-400',
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-amber-500/15 text-amber-400',
    abandoned: 'bg-muted text-zinc-500',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status] || 'bg-muted text-muted-foreground',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
