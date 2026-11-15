'use client';

import { Binary, Layers, Scale, ShieldAlert } from 'lucide-react';
import { MagicCard } from '@/components/magicui';

const stages = [
  {
    step: 'STAGE 01',
    icon: Layers,
    title: 'Contextual Bullet Chunking',
    metric: 'Focus-nDCG@5: 0.727 vs 0.244 legacy',
    description:
      'Parses resume sections (EXPERIENCE, PROJECTS, SKILLS) and role headers, prefixing each atomic bullet with [Section | Role] before indexing into pgvector HNSW and PostgreSQL GIN Full-Text Search.',
  },
  {
    step: 'STAGE 02',
    icon: Binary,
    title: 'Requirement Decomposition & RRF',
    metric: 'Hybrid RRF p = 0.0040 vs Dense',
    description:
      'Decomposes raw job descriptions into must-have and nice-to-have competencies, fusing Dense Bi-Encoders (BGE), Tech-Tokenized BM25, and Postgres ts_rank_cd via Reciprocal Rank Fusion (k=60).',
  },
  {
    step: 'STAGE 03',
    icon: Scale,
    title: 'Cross-Encoder Reranking & MMR',
    metric: 'Recall@5: 83.5% · nDCG@5: 0.749',
    description:
      'Rescores top candidate passages jointly with the query via neural Cross-Encoders (ms-marco-MiniLM-L6 & BGE-Reranker-Base) and applies Maximal Marginal Relevance (MMR) to prevent redundant context.',
  },
  {
    step: 'STAGE 04',
    icon: ShieldAlert,
    title: 'Citation Guardrail & Rubric Calibration',
    metric: '100% Grounded · Spearman ρ = 0.830',
    description:
      'Verifies every question anchor via exact substring, RapidFuzz partial ratio, and semantic entailment—auto-repairing hallucinated quotes—and grades answers without verbosity bias.',
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
      <div className="flex flex-col items-center text-center mb-14">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          System Architecture
        </p>
        <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Four-stage RAG &amp; verification pipeline
        </h2>
        <p className="mt-3 max-w-2xl text-sm sm:text-base text-muted-foreground">
          Built to solve the failure modes of naive single-vector RAG on dense
          technical documents: context dilution, acronym mismatch, lexical traps,
          and ungrounded LLM citations.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <MagicCard key={stage.step} className="p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-border/80 bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                  {stage.step}
                </span>
                <span className="font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {stage.metric}
                </span>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-muted/40">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {stage.title}
                </h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {stage.description}
              </p>
            </MagicCard>
          );
        })}
      </div>
    </section>
  );
}
