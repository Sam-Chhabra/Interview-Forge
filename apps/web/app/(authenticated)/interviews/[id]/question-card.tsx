'use client';

import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  api,
  ApiError,
  type InterviewAnswer,
  type InterviewQuestion,
} from '@/lib/api';
import { cn } from '@/lib/utils';

import { EvaluationDisplay } from './evaluation-display';

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    behavioral: 'bg-purple-100 text-purple-700',
    technical_concept: 'bg-blue-100 text-blue-700',
    technical_project: 'bg-indigo-100 text-indigo-700',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[type] || 'bg-zinc-100 text-zinc-700',
      )}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const styles: Record<string, string> = {
    easy: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    hard: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        styles[difficulty] || 'bg-zinc-100 text-zinc-700',
      )}
    >
      {difficulty}
    </span>
  );
}

export function QuestionCard({
  sessionId,
  question,
  initialAnswer,
  index,
  onAnswerSubmitted,
}: {
  sessionId: string;
  question: InterviewQuestion;
  initialAnswer: InterviewAnswer | null;
  index: number;
  onAnswerSubmitted?: () => void;
}) {
  const [answer, setAnswer] = useState<InterviewAnswer | null>(initialAnswer);
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (answerText.trim().length < 1) {
      toast.error('Type an answer before submitting');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await api.interviews.submitAnswer(sessionId, {
        question_id: question.id,
        answer_text: answerText,
      });
      setAnswer(created);
      setAnswerText('');
      if (created.evaluation_status === 'completed') {
        toast.success('Answer evaluated');
      } else if (created.evaluation_status === 'failed') {
        toast.warning('Answer saved, but evaluation failed');
      } else {
        toast.success('Answer submitted');
      }
      onAnswerSubmitted?.();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.detail : 'Failed to submit answer',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Question {index + 1}
        </span>
        <TypeBadge type={question.type} />
        <DifficultyBadge difficulty={question.difficulty} />
      </div>

      <p className="font-medium">{question.question}</p>
      <p className="text-sm text-muted-foreground">
        Why we asked: {question.rationale}
      </p>
      <p className="text-xs text-muted-foreground">
        Anchored to: <em>{question.anchor}</em>
      </p>

      {!answer ? (
        <div className="space-y-3">
          <Textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Type your answer here..."
            className="min-h-[140px]"
            disabled={isSubmitting}
          />
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || answerText.trim().length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Evaluating…
              </>
            ) : (
              'Submit answer'
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">Your answer:</p>
            <p className="whitespace-pre-wrap border-l-2 border-zinc-200 pl-4 text-sm">
              {answer.answer_text}
            </p>
          </div>

          {answer.evaluation_status === 'evaluating' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Evaluating…
            </p>
          )}

          {answer.evaluation_status === 'failed' && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Evaluation failed. The answer was saved but couldn&apos;t be
              scored.
            </p>
          )}

          {answer.evaluation_status === 'completed' &&
            answer.evaluation_json && (
              <EvaluationDisplay evaluation={answer.evaluation_json} />
            )}
        </div>
      )}
    </Card>
  );
}
