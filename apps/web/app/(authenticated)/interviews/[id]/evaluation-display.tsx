'use client';

import type { EvaluationRubric } from '@/lib/api';
import { cn } from '@/lib/utils';

function scoreColor(score: number): string {
  if (score >= 4) return 'text-emerald-700';
  if (score >= 3) return 'text-amber-700';
  return 'text-red-700';
}

export function EvaluationDisplay({
  evaluation,
}: {
  evaluation: EvaluationRubric;
}) {
  const dimensions = [
    { label: 'Clarity', value: evaluation.clarity },
    { label: 'Structure', value: evaluation.structure },
    { label: 'Depth', value: evaluation.depth },
    { label: 'Relevance', value: evaluation.relevance },
  ];

  return (
    <div className="border-t pt-4 mt-4">
      <div className="mb-4">
        <span className="text-sm text-muted-foreground">Overall score: </span>
        <span
          className={cn(
            'text-3xl font-bold',
            scoreColor(evaluation.overall_score),
          )}
        >
          {evaluation.overall_score.toFixed(1)}
        </span>
        <span className="text-sm text-muted-foreground"> / 5</span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-3">
        {dimensions.map((d) => (
          <div key={d.label} className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {d.label}
            </p>
            <p className={cn('text-xl font-bold', scoreColor(d.value))}>
              {d.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-sm font-semibold text-emerald-700">
            Strengths
          </h4>
          <ul className="space-y-1">
            {evaluation.strengths.map((s, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                <span className="text-emerald-700">+</span> {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-1 text-sm font-semibold text-amber-700">
            Areas to improve
          </h4>
          <ul className="space-y-1">
            {evaluation.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                <span className="text-amber-700">−</span> {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-md bg-muted p-3">
        <p className="text-sm">
          <span className="font-medium">Suggested improvement: </span>
          <span className="text-muted-foreground">
            {evaluation.suggested_improvement}
          </span>
        </p>
      </div>
    </div>
  );
}
