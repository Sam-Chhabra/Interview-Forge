'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  api,
  ApiError,
  type Resume,
  type ResumeChunkMatch,
} from '@/lib/api';

const STRATEGIES = [
  { id: 'hybrid_rerank', label: 'Hybrid RRF + Cross-Encoder Rerank (Default)' },
  { id: 'hybrid_rrf', label: 'Hybrid Reciprocal Rank Fusion (RRF)' },
  { id: 'dense', label: 'Dense Vector Search (pgvector Cosine)' },
  { id: 'bm25', label: 'Lexical BM25 (Tech Tokenizer)' },
  { id: 'fts', label: 'PostgreSQL Full-Text Search (ts_rank_cd)' },
];

export function ResumeDetail({ id }: { id: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('distributed systems scalability Python');
  const [strategy, setStrategy] = useState('hybrid_rerank');
  const [matches, setMatches] = useState<ResumeChunkMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const res = await api.resumes.search(id, query, strategy, 5);
      setMatches(res);
    } catch {
      /* ignore */
    } finally {
      setIsSearching(false);
    }
  }

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
            <div className="mt-8 space-y-6">
              <div className="rounded-lg border p-5">
                <h2 className="text-base font-semibold">
                  Interactive Multi-Strategy Retrieval Inspector
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Test how Dense pgvector, PostgreSQL FTS, BM25, Hybrid RRF, and
                  Cross-Encoder Reranking score your indexed contextual resume chunks.
                </p>
                <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter a job requirement or skill query..."
                    className="flex-1"
                  />
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" disabled={isSearching}>
                    {isSearching ? 'Retrieving…' : 'Search Chunks'}
                  </Button>
                </form>

                {matches.length > 0 && (
                  <div className="mt-5 space-y-3">
                    {matches.map((m, i) => (
                      <div
                        key={m.chunk_index}
                        className="rounded-md border bg-muted/20 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="font-mono font-medium text-foreground">
                            #{i + 1} · Chunk {m.chunk_index}
                            {m.section_title ? ` · ${m.section_title}` : ''}
                          </span>
                          <div className="flex flex-wrap gap-3 font-mono">
                            <span>Score: {m.similarity.toFixed(3)}</span>
                            {m.dense_score != null && (
                              <span>
                                Dense: {m.dense_score.toFixed(3)} (#{m.dense_rank})
                              </span>
                            )}
                            {m.lexical_score != null && (
                              <span>
                                Lexical: {m.lexical_score.toFixed(2)} (#{m.lexical_rank})
                              </span>
                            )}
                            {m.rerank_prob != null && (
                              <span>
                                Cross-Encoder P: {(m.rerank_prob * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-foreground">
                          {m.raw_content || m.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
