'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  ApiError,
  type InterviewSessionListItem,
  type UserStats,
} from '@/lib/api';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<InterviewSessionListItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    Promise.all([api.interviews.list(), api.interviews.stats()])
      .then(([sessionsData, statsData]) => {
        setSessions(sessionsData);
        setStats(statsData);
      })
      .catch((err) => {
        toast.error(
          err instanceof ApiError ? err.detail : 'Failed to load dashboard',
        );
      })
      .finally(() => {
        setIsLoadingSessions(false);
        setIsLoadingStats(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      {isLoadingSessions ? (
        <Skeleton className="h-8 w-64 mb-6" />
      ) : (
        <h1 className="text-2xl font-semibold">
          Welcome back{user?.full_name ? `, ${user.full_name}` : ''}
        </h1>
      )}

      {stats && stats.total_answers > 0 && (
        <section className="mb-10 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Sessions" value={stats.total_sessions.toString()} />
            <StatTile
              label="Completed"
              value={`${stats.completed_sessions}/${stats.total_sessions}`}
            />
            <StatTile label="Answers" value={stats.total_answers.toString()} />
            <StatTile
              label="Avg score"
              value={
                stats.average_score !== null
                  ? `${stats.average_score}/5`
                  : '—'
              }
            />
          </div>

          {stats.weakest_dimension && stats.dimension_averages && (
            <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/15 flex-shrink-0">
                <Target className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                  Focus area
                </p>
                <p className="text-sm">
                  <span className="font-medium capitalize">
                    {stats.weakest_dimension}
                  </span>{' '}
                  is your lowest-scoring dimension (avg{' '}
                  <span className="font-medium">
                    {stats.dimension_averages[stats.weakest_dimension]}/5
                  </span>{' '}
                  across {stats.total_answers} answers).
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <Card className="mt-6">
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Generate a personalized mock interview from one of your resumes and
            a target role.
          </p>
          <Button asChild size="lg">
            <Link href="/interviews/new">Start a new mock interview →</Link>
          </Button>
        </CardContent>
      </Card>

      {isLoadingSessions ? (
        <Skeleton className="h-6 w-40 mt-10 mb-4" />
      ) : (
        <h2 className="mt-10 mb-4 text-lg font-semibold">Recent sessions</h2>
      )}

      <div className="space-y-2">
        {isLoadingSessions ? (
          [0, 1, 2].map((i) => (
            <Card
              key={i}
              className="flex flex-row items-center justify-between p-4"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-16" />
            </Card>
          ))
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/30">
            <div className="mx-auto h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium mb-1">No interviews yet</p>
            <p className="text-sm text-muted-foreground">
              Start your first mock interview above.
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <Card
              key={s.id}
              className="flex flex-row items-center justify-between gap-4 p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-medium">
                  Interview from {new Date(s.created_at).toLocaleDateString()}
                </span>
                <StatusBadge status={s.status} />
                <span className="text-sm text-muted-foreground">
                  {s.num_questions} questions
                </span>
              </div>
              <Link
                href={`/interviews/${s.id}`}
                className="text-sm underline underline-offset-4"
              >
                Open →
              </Link>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
