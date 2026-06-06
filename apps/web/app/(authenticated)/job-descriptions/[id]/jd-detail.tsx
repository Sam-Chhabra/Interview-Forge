'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { api, ApiError, type JobDescription } from '@/lib/api';

export function JobDescriptionDetail({ id }: { id: string }) {
  const [jd, setJd] = useState<JobDescription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.jobDescriptions
      .get(id)
      .then((data) => {
        if (!cancelled) setJd(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.detail
              : 'Failed to load job description',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/job-descriptions"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to job descriptions
      </Link>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        </div>
      ) : error || !jd ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Job description not found.
        </p>
      ) : (
        <div className="mt-6">
          <h1 className="text-2xl font-semibold">{jd.title}</h1>
          {jd.company && (
            <p className="mt-1 text-muted-foreground">{jd.company}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(jd.created_at).toLocaleDateString()}
          </p>
          <Card className="mt-6">
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {jd.raw_text}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
