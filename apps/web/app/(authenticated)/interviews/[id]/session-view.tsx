'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  api,
  ApiError,
  type InterviewAnswer,
  type InterviewSession,
} from '@/lib/api';

import { QuestionCard } from './question-card';

export function InterviewSessionView({ id }: { id: string }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answers, setAnswers] = useState<InterviewAnswer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.interviews.get(id), api.interviews.listAnswers(id)])
      .then(([sessionData, answerData]) => {
        if (cancelled) return;
        setSession(sessionData);
        setAnswers(answerData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.detail : 'Failed to load interview',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refetchSessionData() {
    try {
      const [updatedSession, updatedAnswers] = await Promise.all([
        api.interviews.get(id),
        api.interviews.listAnswers(id),
      ]);
      setSession(updatedSession);
      setAnswers(updatedAnswers);
    } catch {
      // silent — the card already updated its own state
    }
  }

  // Latest answer per question_id (newest created_at wins).
  const latestByQuestion = new Map<string, InterviewAnswer>();
  [...answers]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .forEach((a) => {
      if (!latestByQuestion.has(a.question_id)) {
        latestByQuestion.set(a.question_id, a);
      }
    });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 space-y-6">
      {isLoading ? (
        <div>
          <Skeleton className="h-4 w-32 mb-6" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72 mb-6" />
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="gap-3 p-6">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        </div>
      ) : error || !session ? (
        <>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to dashboard
          </Link>
          <p className="text-sm text-muted-foreground">Interview not found.</p>
        </>
      ) : (
        <>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Mock Interview</h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={session.status} />
              <span>·</span>
              <span>
                {latestByQuestion.size} of {session.questions.length} answered
              </span>
              <span>·</span>
              <span>{new Date(session.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="space-y-4">
            {[...session.questions]
              .sort((a, b) => a.order_index - b.order_index)
              .map((q, i) => (
                <QuestionCard
                  key={q.id}
                  sessionId={session.id}
                  question={q}
                  initialAnswer={latestByQuestion.get(q.id) ?? null}
                  index={i}
                  onAnswerSubmitted={refetchSessionData}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
