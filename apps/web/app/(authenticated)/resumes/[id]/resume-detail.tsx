'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { api, ApiError, type Resume } from '@/lib/api';

export function ResumeDetail({ id }: { id: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const data = await api.resumes.get(id);
        if (cancelled) return;
        setResume(data);
        setIsLoading(false);

        if (
          data.parse_status === 'pending' ||
          data.parse_status === 'processing'
        ) {
          interval = setInterval(async () => {
            try {
              const updated = await api.resumes.get(id);
              if (cancelled) return;
              setResume(updated);
              if (
                updated.parse_status === 'completed' ||
                updated.parse_status === 'failed'
              ) {
                if (interval) clearInterval(interval);
              }
            } catch {
              /* transient error — keep polling */
            }
          }, 2000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.detail : 'Failed to load resume',
        );
        setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/resumes"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to resumes
      </Link>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        </div>
      ) : error ? (
        <p className="mt-6 text-sm text-destructive">{error}</p>
      ) : resume ? (
        <div className="mt-6">
          <h1 className="text-2xl font-semibold">{resume.filename}</h1>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={resume.parse_status} />
            <span className="text-sm text-muted-foreground">
              {new Date(resume.created_at).toLocaleDateString()}
            </span>
          </div>
          {resume.parse_status === 'completed' && (
            <p className="mt-4 text-sm text-muted-foreground">
              Resume processed. (Chunks and embeddings are stored.)
            </p>
          )}
          {resume.parse_status === 'failed' && (
            <p className="mt-4 text-sm text-destructive">
              Processing failed. Try uploading again.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
