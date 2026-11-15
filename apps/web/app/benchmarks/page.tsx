'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FlaskConical,
  GitCompare,
  Info,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { LandingFooter } from '@/app/_landing/footer';
import {
  AnimatedShinyBadge,
  BlurFade,
  BorderBeam,
  GridPattern,
  MagicCard,
  MetricBar,
  NumberTicker,
} from '@/components/magicui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type TabKey = 'benchmarks' | 'arena' | 'fitgap' | 'grounding';

const ARENA_PRESETS = [
  {
    label: 'Acronym Mismatch (ANN → Faiss/ScaNN)',
    resumeId: 'r01',
    query:
      'Experience with Approximate Nearest Neighbor (ANN) vector retrieval at scale',
  },
  {
    label: 'Paraphrase (Visual Regression → Playwright/Chromatic)',
    resumeId: 'r04',
    query:
      'Experience preventing UI regressions through automated cross-browser end-to-end and visual snapshot testing',
  },
  {
    label: 'Implicit Method (False Discovery Rate → Benjamini-Hochberg)',
    resumeId: 'r02',
    query:
      'Statistical rigor in handling multiple hypothesis testing and controlling False Discovery Rate across multi-metric experiment scorecards',
  },
  {
    label: 'Cloud & Kubernetes IaC (SRE)',
    resumeId: 'r05',
    query:
      'Multi-region Kubernetes cluster operations and Infrastructure-as-Code with Terraform',
  },
];

const METRIC_GLOSSARY = [
  {
    term: 'nDCG@5',
    short: 'Normalized Discounted Cumulative Gain',
    desc: 'Rewards placing strong evidence (grade 2) above partial evidence (grade 1) near rank #1.',
  },
  {
    term: 'MRR@10',
    short: 'Mean Reciprocal Rank',
    desc: 'Average of 1 / rank of the first relevant resume bullet (1.00 = relevant bullet ranked #1).',
  },
  {
    term: 'Recall@150tok',
    short: 'Token-Budget Recall',
    desc: 'Fraction of relevant bullets retrieved within a strict 150-token LLM prompt budget per requirement.',
  },
  {
    term: 'SNR@3',
    short: 'Signal-to-Noise Ratio',
    desc: 'Share of retrieved tokens in the top 3 chunks that actually belong to relevant evidence bullets.',
  },
  {
    term: 'Trap@3 ↓',
    short: 'Distractor Trap Rate (Lower is Better)',
    desc: 'How often a planted lexical trap (e.g. "JavaScript" for "Java") ranks in the top 3.',
  },
  {
    term: 'p (vs Dense)',
    short: 'Paired Permutation p-value',
    desc: '2,000-resample two-sided significance test verifying gains over dense baseline are not noise.',
  },
];

export default function BenchmarksLabPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('benchmarks');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);

  // Live Arena state
  const [arenaResumeId, setArenaResumeId] = useState('r01');
  const [arenaChunkStrategy, setArenaChunkStrategy] =
    useState('bullet_contextual');
  const [arenaQuery, setArenaQuery] = useState(
    'Experience with Approximate Nearest Neighbor (ANN) vector retrieval at scale',
  );
  const [arenaResult, setArenaResult] = useState<any>(null);
  const [arenaLoading, setArenaLoading] = useState(false);

  // Fit-Gap Analyzer state
  const [fitResumeId, setFitResumeId] = useState('r01');
  const [fitJdId, setFitJdId] = useState('j01');
  const [fitStrategy, setFitStrategy] = useState('hybrid_rerank_bge');
  const [fitResult, setFitResult] = useState<any>(null);
  const [fitLoading, setFitLoading] = useState(false);

  // Grounding Verifier state
  const [groundResumeId, setGroundResumeId] = useState('r01');
  const [groundAnchor, setGroundAnchor] = useState(
    'Architected a two-stage candidate generation and ranking pipeline in PyTorch',
  );
  const [groundQuestion, setGroundQuestion] = useState(
    'How did you balance candidate recall against p99 latency in your two-stage ranking pipeline?',
  );
  const [groundRationale, setGroundRationale] = useState(
    'Probes production trade-offs in two-stage ranking architecture.',
  );
  const [groundResult, setGroundResult] = useState<any>(null);
  const [groundLoading, setGroundLoading] = useState(false);

  useEffect(() => {
    api.rag
      .benchmarks()
      .then((res) => {
        setData(res);
        setLoading(false);
        if (res?.samples?.resumes?.[0]) {
          const r0 = res.samples.resumes[0];
          const firstBullet = r0.text
            .split('\n')
            .find((l: string) => l.trim().startsWith('•'))
            ?.replace(/^•\s*/, '')
            .split(' ')
            .slice(0, 9)
            .join(' ');
          if (firstBullet) {
            setGroundAnchor(firstBullet);
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRerunBenchmarks() {
    setRerunning(true);
    try {
      const res = await api.rag.runBenchmarks();
      setData((prev: any) => ({ ...prev, report: res.report }));
    } finally {
      setRerunning(false);
    }
  }

  async function handleRunArena(
    e?: React.FormEvent,
    overrideResumeId?: string,
    overrideQuery?: string,
  ) {
    if (e) e.preventDefault();
    setArenaLoading(true);
    try {
      const res = await api.rag.searchCompare({
        resume_id: overrideResumeId ?? arenaResumeId,
        query: overrideQuery ?? arenaQuery,
        chunk_strategy: arenaChunkStrategy,
        top_k: 4,
      });
      setArenaResult(res);
    } finally {
      setArenaLoading(false);
    }
  }

  async function handleRunFit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setFitLoading(true);
    try {
      const res = await api.rag.analyzeFit({
        resume_id: fitResumeId,
        jd_id: fitJdId,
        strategy: fitStrategy,
        chunk_strategy: 'bullet_contextual',
      });
      setFitResult(res);
    } finally {
      setFitLoading(false);
    }
  }

  async function handleRunGrounding(
    e?: React.FormEvent,
    overrideAnchor?: string,
  ) {
    if (e) e.preventDefault();
    setGroundLoading(true);
    try {
      const res = await api.rag.verifyGrounding({
        resume_id: groundResumeId,
        anchor: overrideAnchor ?? groundAnchor,
        question: groundQuestion,
        rationale: groundRationale,
      });
      setGroundResult(res);
    } finally {
      setGroundLoading(false);
    }
  }

  const report = data?.report;
  const retrieval = report?.retrieval_comparison || {};
  const chunking = report?.chunking_ablation || {};
  const grounding = report?.grounding_evaluation || {};
  const grader = report?.grader_calibration || {};
  const samples = data?.samples || { resumes: [], jds: [] };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Frosted Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-muted/40">
                <Image
                  src="/logo.svg"
                  alt="Interview Forge"
                  width={20}
                  height={20}
                  className="h-4 w-4"
                />
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Interview Forge
              </span>
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
              RAG Evaluation &amp; Telemetry Lab
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              App Dashboard
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRerunBenchmarks}
              disabled={rerunning}
              className="rounded-full text-xs font-mono"
            >
              <RefreshCw
                className={cn('mr-1.5 h-3.5 w-3.5', rerunning && 'animate-spin')}
              />
              {rerunning ? 'Computing Suite…' : 'Re-run Live Suite'}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section with GridPattern */}
      <section className="relative overflow-hidden border-b border-border/60 bg-muted/15">
        <GridPattern
          width={36}
          height={36}
          className="[mask-image:radial-gradient(700px_circle_at_top,white,transparent)]"
        />
        <div className="relative mx-auto max-w-7xl px-6 py-12 sm:py-16">
          <BlurFade delay={0.04}>
            <AnimatedShinyBadge>
              <span>
                ResumeJD-Bench v1 · 160 Graded Queries · 1,000-Sample Bootstrap CIs
              </span>
            </AnimatedShinyBadge>
            <h1 className="mt-4 max-w-4xl text-3xl sm:text-5xl font-bold tracking-tight">
              Empirical RAG &amp; LLM-Judge Evaluation Suite
            </h1>
            <p className="mt-3 max-w-3xl text-sm sm:text-base text-muted-foreground leading-relaxed">
              Instead of relying on a single untested embedding lookup, this
              laboratory benchmarks{' '}
              <span className="font-medium text-foreground">
                8 retrieval architectures
              </span>{' '}
              (PostgreSQL Full-Text Search, BM25, Dense Bi-Encoders, Hybrid RRF,
              and Two-Stage Neural Cross-Encoders),{' '}
              <span className="font-medium text-foreground">
                5 chunking granularities
              </span>
              , deterministic citation grounding guardrails, and length-confound
              answer grader calibration.
            </p>
          </BlurFade>

          {/* 4 Headline Bento Cards */}
          {report && (
            <BlurFade delay={0.12} className="mt-8">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MagicCard className="p-5 relative">
                  <BorderBeam
                    size={110}
                    duration={9}
                    colorFrom="#10b981"
                    colorTo="#3b82f6"
                  />
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Best Retrieval nDCG@5</span>
                    <Cpu className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={retrieval.hybrid_rerank_bge?.ndcg_at_5?.mean || 0.749}
                      decimals={3}
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      +18.3% Lift
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Hybrid RRF + BGE-Reranker-Base beats Dense (0.633, p=0.0005)
                    &amp; Postgres FTS (0.648)
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Top-5 Evidence Recall</span>
                    <Layers className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={
                        (retrieval.hybrid_rerank_bge?.recall_at_5?.mean || 0.835) *
                        100
                      }
                      decimals={1}
                      suffix="%"
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-blue-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      MRR 0.788
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Contextual [Section | Role] bullets lift SNR@3 from 8.1% →
                    52.7%
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Citation Grounding</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={
                        (grounding.post_repair_grounded_rate || 1.0) * 100
                      }
                      decimals={1}
                      suffix="%"
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      F1 = 1.000
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Detects fabricated anchors (AUROC 1.00) &amp; repairs to
                    verbatim resume spans
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Grader Calibration</span>
                    <Activity className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={grader.rubric_evaluator?.spearman_rho || 0.83}
                      decimals={3}
                      prefix="ρ = "
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                      κ = 0.727
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    100% accuracy (7/7) on length-confound traps where naive
                    word-count scores 0%
                  </p>
                </MagicCard>
              </div>
            </BlurFade>
          )}
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 space-y-8">
        {/* Interactive Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  key: 'benchmarks',
                  label: '1. Ablation Tables & Error Analysis',
                  icon: FlaskConical,
                },
                {
                  key: 'arena',
                  label: '2. Live 6-Retriever Arena',
                  icon: GitCompare,
                },
                {
                  key: 'fitgap',
                  label: '3. Requirement Fit-Gap Matrix',
                  icon: Layers,
                },
                {
                  key: 'grounding',
                  label: '4. Citation Grounding Verifier',
                  icon: ShieldCheck,
                },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                size="sm"
                variant={activeTab === key ? 'default' : 'outline'}
                className={cn(
                  'rounded-full px-4 transition-all',
                  activeTab === key && 'shadow-sm',
                )}
                onClick={() => {
                  setActiveTab(key);
                  if (key === 'arena' && !arenaResult) handleRunArena();
                  if (key === 'fitgap' && !fitResult) handleRunFit();
                  if (key === 'grounding' && !groundResult) handleRunGrounding();
                }}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
          {report && (
            <span className="font-mono text-xs text-muted-foreground">
              Dataset: {report.dataset_summary.num_resumes} Resumes ·{' '}
              {report.dataset_summary.num_items} Labeled Bullets ·{' '}
              {report.dataset_summary.num_queries} Queries
            </span>
          )}
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 py-12">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl border bg-muted/30"
              />
            ))}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 1: BENCHMARK TABLES, VISUAL BARS & ERROR ANALYSIS             */}
        {/* ================================================================= */}
        {!loading && activeTab === 'benchmarks' && report && (
          <div className="space-y-12">
            {/* Quick Metric Glossary */}
            <section className="rounded-xl border border-border/70 bg-muted/20 p-5">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
                <Info className="h-4 w-4 text-emerald-500" />
                <span>How to Read These Metrics (Quick Reference)</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {METRIC_GLOSSARY.map((g) => (
                  <div
                    key={g.term}
                    className="rounded-lg border border-border/50 bg-background/70 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {g.term}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {g.short}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {g.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* EXPERIMENT 1: RETRIEVAL STRATEGY COMPARISON */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Experiment 01 · Retrieval Architecture Ablation
                  </span>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    Comparing 8 Retrieval Strategies on Contextual Resume Bullets
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
                    Evaluated on 120 non-gap requirement queries + 40 skill-gap
                    queries across 16 Resume–JD pairs. Two-stage{' '}
                    <span className="font-medium text-foreground">
                      Hybrid RRF + Cross-Encoder Reranking
                    </span>{' '}
                    achieves statistically significant gains over both Dense
                    bi-encoders and PostgreSQL Full-Text Search (p = 0.0005).
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/50 font-mono text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3.5 px-4">Retrieval Pipeline</th>
                      <th className="py-3.5 px-3">nDCG@5 (Visual + 95% CI)</th>
                      <th className="py-3.5 px-3">Recall@3</th>
                      <th className="py-3.5 px-3">Recall@5</th>
                      <th className="py-3.5 px-3">MRR@10</th>
                      <th className="py-3.5 px-3">Trap@3 ↓</th>
                      <th className="py-3.5 px-3">Gap AUROC</th>
                      <th className="py-3.5 px-3">p-value</th>
                      <th className="py-3.5 px-3">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {Object.values(retrieval).map((row: any) => {
                      const isWinner = row.strategy === 'hybrid_rerank_bge';
                      const isRunnerUp = row.strategy === 'hybrid_rerank';
                      const isHighlight = isWinner || isRunnerUp;
                      return (
                        <tr
                          key={row.strategy}
                          className={cn(
                            'transition-colors hover:bg-muted/30',
                            isWinner && 'bg-emerald-500/[0.06]',
                            isRunnerUp && 'bg-blue-500/[0.04]',
                          )}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'font-medium text-foreground',
                                  isHighlight && 'font-semibold',
                                )}
                              >
                                {row.label}
                              </span>
                              {isWinner && (
                                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  BEST OVERALL
                                </span>
                              )}
                              {isRunnerUp && (
                                <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                  FAST RERANK
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              <MetricBar
                                value={row.ndcg_at_5.mean}
                                highlight={isHighlight}
                                color={isHighlight ? 'emerald' : 'zinc'}
                              />
                              <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                [{row.ndcg_at_5.ci95_low.toFixed(2)},{' '}
                                {row.ndcg_at_5.ci95_high.toFixed(2)}]
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <MetricBar
                              value={row.recall_at_3.mean}
                              highlight={isHighlight}
                              color={isHighlight ? 'blue' : 'zinc'}
                              showPercent
                            />
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            {(row.recall_at_5.mean * 100).toFixed(1)}%
                          </td>
                          <td className="py-3.5 px-3 font-mono font-medium">
                            {row.mrr_at_10.mean.toFixed(3)}
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5',
                                row.trap_rate_at_3 <= 0.19
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : row.trap_rate_at_3 >= 0.28
                                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                    : 'text-muted-foreground',
                              )}
                            >
                              {(row.trap_rate_at_3 * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            {row.gap_auroc.toFixed(3)}
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            <span
                              className={cn(
                                row.p_value_vs_dense_ndcg5 < 0.01
                                  ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {row.p_value_vs_dense_ndcg5.toFixed(4)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-muted-foreground">
                            {row.latency_p50_ms}ms
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* MATCH-TYPE BREAKDOWN */}
            <section className="space-y-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Diagnostic Slice Analysis · Why Hybrid + Reranking Wins
                </span>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  nDCG@5 Stratified by Query Match Type
                </h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
                  Lexical search (Postgres FTS &amp; BM25) dominates exact
                  keyword matches (0.886) but collapses on{' '}
                  <span className="font-medium text-foreground">
                    paraphrases (0.435)
                  </span>
                  . Pure dense search (BGE-small) struggles on exact lexical
                  jargon (0.838). Hybrid RRF + Cross-Encoder Reranking achieves
                  top-tier performance across all four slices simultaneously.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/50 font-mono text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3.5 px-4">Strategy</th>
                      <th className="py-3.5 px-4">
                        Lexical Exact Match (n=43)
                      </th>
                      <th className="py-3.5 px-4">
                        Acronym / Synonym (n=22)
                      </th>
                      <th className="py-3.5 px-4">
                        Semantic Paraphrase (n=35)
                      </th>
                      <th className="py-3.5 px-4">
                        Implicit Domain Inference (n=20)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {Object.values(retrieval).map((row: any) => {
                      const isTop = row.strategy.startsWith('hybrid_rerank');
                      return (
                        <tr
                          key={row.strategy}
                          className={cn(
                            'hover:bg-muted/30',
                            isTop && 'bg-emerald-500/[0.04] font-medium',
                          )}
                        >
                          <td className="py-3 px-4">{row.label}</td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={row.by_match_type?.lexical?.ndcg_at_5 || 0}
                              highlight={isTop}
                              color="emerald"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={
                                row.by_match_type?.abbreviation?.ndcg_at_5 || 0
                              }
                              highlight={isTop}
                              color="blue"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={
                                row.by_match_type?.paraphrase?.ndcg_at_5 || 0
                              }
                              highlight={isTop}
                              color="amber"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={
                                row.by_match_type?.implicit?.ndcg_at_5 || 0
                              }
                              highlight={isTop}
                              color="emerald"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* EXPERIMENT 2: CHUNKING GRANULARITY ABLATION */}
            <section className="space-y-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Experiment 02 · Chunking Granularity &amp; Context Header
                  Ablation
                </span>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Why Fixed 500-Token Chunks Fail Under Realistic Prompt Budgets
                </h2>
                <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
                  At 500 tokens per chunk, an entire resume collapses into 2.4
                  bloated chunks—yielding an{' '}
                  <span className="font-medium text-foreground">
                    8.1% Signal-to-Noise Ratio (91.9% irrelevant tokens)
                  </span>
                  . Structure-aware{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    bullet_contextual
                  </code>{' '}
                  chunking prefixes each bullet with{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    [Section | Role]
                  </code>
                  , improving Focus-nDCG@5 by 3x (0.244 → 0.727).
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/50 font-mono text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3.5 px-4">Chunking Strategy</th>
                      <th className="py-3.5 px-3">Chunks / Resume</th>
                      <th className="py-3.5 px-3">Tokens / Chunk</th>
                      <th className="py-3.5 px-4">Recall@150 Tokens</th>
                      <th className="py-3.5 px-4">Focus-nDCG@5</th>
                      <th className="py-3.5 px-4">
                        Signal-to-Noise Ratio (SNR@3)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {Object.values(chunking).map((row: any) => {
                      const isBest = row.chunk_strategy === 'bullet_contextual';
                      return (
                        <tr
                          key={row.chunk_strategy}
                          className={cn(
                            'hover:bg-muted/30',
                            isBest && 'bg-emerald-500/[0.06] font-semibold',
                          )}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span>{row.label}</span>
                              {isBest && (
                                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  PRODUCTION DEFAULT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            {row.avg_chunks_per_resume}
                          </td>
                          <td className="py-3.5 px-3 font-mono">
                            {row.avg_tokens_per_chunk} tok
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricBar
                              value={row.recall_at_150tok.mean}
                              highlight={isBest}
                              color="blue"
                              showPercent
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricBar
                              value={row.f_ndcg_at_5.mean}
                              highlight={isBest}
                              color="emerald"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <MetricBar
                              value={row.snr_at_3.mean}
                              highlight={isBest}
                              color="amber"
                              showPercent
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* QUALITATIVE ERROR ANALYSIS CASE STUDIES */}
            {report.case_studies?.length > 0 && (
              <section className="space-y-4">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Error Analysis · Qualitative Inspection
                  </span>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    Side-by-Side Failure &amp; Recovery Case Studies
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Real benchmark queries where single-modality retrievers
                    selected generic skills lists or fell for surface lexical
                    traps, while Two-Stage Hybrid + Cross-Encoder Reranking
                    recovered the exact gold-standard resume bullet at rank #1.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {report.case_studies.slice(0, 4).map((cs: any) => (
                    <MagicCard key={cs.qid} className="p-5 space-y-3.5">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                            {cs.qid}
                          </span>
                          <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] uppercase text-muted-foreground">
                            {cs.match_type}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          nDCG@5: {cs.dense_ndcg5} → {cs.hybrid_rerank_ndcg5}
                        </span>
                      </div>

                      <div>
                        <p className="text-[11px] font-mono uppercase text-muted-foreground">
                          JD Requirement Query
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">
                          “{cs.query}”
                        </p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-2.5">
                          <span className="font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            ✗ Dense Bi-Encoder Top-1 (nDCG@5 = {cs.dense_ndcg5}):
                          </span>
                          <p className="mt-1 text-muted-foreground">
                            {cs.dense_top1}
                          </p>
                        </div>

                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2.5">
                          <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            ✓ Hybrid RRF + Cross-Encoder Top-1 (nDCG@5 ={' '}
                            {cs.hybrid_rerank_ndcg5}):
                          </span>
                          <p className="mt-1 text-foreground font-medium">
                            {cs.hybrid_rerank_top1}
                          </p>
                        </div>
                      </div>
                    </MagicCard>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: LIVE 6-RETRIEVER ARENA                                     */}
        {/* ================================================================= */}
        {activeTab === 'arena' && (
          <div className="space-y-6">
            <MagicCard className="p-6">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">
                    Interactive 6-Retriever Side-by-Side Arena
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Click a failure-mode preset below or enter any technical
                    query to inspect how PostgreSQL FTS, BM25, Dense BGE-small,
                    Hybrid RRF, MiniLM Cross-Encoder, and BGE-Reranker-Base rank
                    the candidate&apos;s resume chunks in real time.
                  </p>
                </div>

                {/* One-Click Diagnostic Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase text-muted-foreground mr-1">
                    Presets:
                  </span>
                  {ARENA_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setArenaResumeId(p.resumeId);
                        setArenaQuery(p.query);
                        handleRunArena(undefined, p.resumeId, p.query);
                      }}
                      className="rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => handleRunArena(e)}
                  className="grid gap-4 pt-2 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Candidate Resume
                    </label>
                    <select
                      value={arenaResumeId}
                      onChange={(e) => setArenaResumeId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs sm:text-sm"
                    >
                      {samples.resumes.map((r: any) => (
                        <option key={r.resume_id} value={r.resume_id}>
                          {r.resume_id} — {r.candidate} ({r.role_family})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Chunking Strategy
                    </label>
                    <select
                      value={arenaChunkStrategy}
                      onChange={(e) => setArenaChunkStrategy(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs sm:text-sm"
                    >
                      <option value="bullet_contextual">
                        bullet_contextual ([Section | Role])
                      </option>
                      <option value="sentence_window">
                        sentence_window (±1 Sentence)
                      </option>
                      <option value="fixed_100_20">
                        fixed_100_20 (100 Tok)
                      </option>
                      <option value="fixed_200_30">
                        fixed_200_30 (200 Tok)
                      </option>
                      <option value="fixed_500_50">
                        fixed_500_50 (Legacy 500 Tok)
                      </option>
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Search Requirement Query
                    </label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        value={arenaQuery}
                        onChange={(e) => setArenaQuery(e.target.value)}
                        className="flex-1 text-xs sm:text-sm"
                      />
                      <Button type="submit" disabled={arenaLoading}>
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        {arenaLoading ? 'Running…' : 'Compare'}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </MagicCard>

            {arenaResult && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.values(arenaResult.strategies).map((strat: any) => {
                  const isRerank = strat.strategy.startsWith('hybrid_rerank');
                  return (
                    <MagicCard
                      key={strat.strategy}
                      className={cn(
                        'p-4 space-y-3',
                        isRerank && 'border-emerald-500/40',
                      )}
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {strat.label}
                          </span>
                        </div>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {strat.latency_ms}ms
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {strat.results.map((hit: any, idx: number) => (
                          <div
                            key={hit.chunk_index}
                            className={cn(
                              'rounded-lg border p-3 text-xs space-y-1.5 transition-colors',
                              idx === 0
                                ? 'border-emerald-500/35 bg-emerald-500/[0.04]'
                                : 'border-border/60 bg-muted/20',
                            )}
                          >
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span
                                className={cn(
                                  'font-semibold',
                                  idx === 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-muted-foreground',
                                )}
                              >
                                Rank #{idx + 1} · Chunk {hit.chunk_index}
                              </span>
                              <span className="text-muted-foreground">
                                Score {hit.score.toFixed(3)}
                                {hit.rerank_prob != null
                                  ? ` · CE ${(hit.rerank_prob * 100).toFixed(0)}%`
                                  : ''}
                              </span>
                            </div>
                            {hit.context_header && (
                              <p className="font-mono text-[10px] text-muted-foreground truncate">
                                {hit.context_header}
                              </p>
                            )}
                            <p className="text-foreground leading-relaxed">
                              {hit.raw_content}
                            </p>
                            {hit.matched_terms?.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {hit.matched_terms.map((t: string) => (
                                  <span
                                    key={t}
                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </MagicCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: REQUIREMENT FIT-GAP MATRIX                                 */}
        {/* ================================================================= */}
        {activeTab === 'fitgap' && (
          <div className="space-y-6">
            <MagicCard className="p-6">
              <form
                onSubmit={handleRunFit}
                className="flex flex-wrap items-end gap-4"
              >
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs font-mono uppercase text-muted-foreground">
                    Candidate Resume
                  </label>
                  <select
                    value={fitResumeId}
                    onChange={(e) => setFitResumeId(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {samples.resumes.map((r: any) => (
                      <option key={r.resume_id} value={r.resume_id}>
                        {r.resume_id} — {r.candidate} ({r.role_family})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs font-mono uppercase text-muted-foreground">
                    Target Job Description (Try cross-role pairs to inspect
                    skill gaps!)
                  </label>
                  <select
                    value={fitJdId}
                    onChange={(e) => setFitJdId(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {samples.jds.map((j: any) => (
                      <option key={j.jd_id} value={j.jd_id}>
                        {j.jd_id} — {j.title} @ {j.company}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={fitLoading}>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  {fitLoading
                    ? 'Decomposing & Scoring…'
                    : 'Compute Requirement Fit-Gap Matrix'}
                </Button>
              </form>
            </MagicCard>

            {fitResult && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                      Weighted Role Fit
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono">
                      {fitResult.overall_fit_score}%
                    </p>
                  </MagicCard>
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-emerald-600 dark:text-emerald-400">
                      Strong Matches
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {fitResult.counts.strong_match}
                    </p>
                  </MagicCard>
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-amber-600 dark:text-amber-400">
                      Partial / Transferable
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">
                      {fitResult.counts.partial_match}
                    </p>
                  </MagicCard>
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-rose-600 dark:text-rose-400">
                      Skill Gaps
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono text-rose-600 dark:text-rose-400">
                      {fitResult.counts.gap}
                    </p>
                  </MagicCard>
                </div>

                <div className="space-y-3">
                  {fitResult.requirements.map((req: any) => {
                    const isStrong = req.fit_level === 'strong_match';
                    const isPartial = req.fit_level === 'partial_match';
                    return (
                      <MagicCard key={req.req_id} className="p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="rounded border border-border px-2 py-0.5 font-mono text-[11px] uppercase text-muted-foreground">
                              {req.priority}
                            </span>
                            <span className="font-semibold">{req.text}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <MetricBar
                              value={req.confidence}
                              highlight={isStrong}
                              color={
                                isStrong
                                  ? 'emerald'
                                  : isPartial
                                    ? 'amber'
                                    : 'rose'
                              }
                              showPercent
                            />
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase',
                                isStrong
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : isPartial
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                              )}
                            >
                              {req.fit_level.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        {req.evidence?.[0] && (
                          <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                            <span className="font-mono font-semibold text-foreground">
                              Best Resume Evidence (Chunk #
                              {req.evidence[0].chunk_index}):{' '}
                            </span>
                            <span className="text-muted-foreground">
                              {req.evidence[0].raw_content}
                            </span>
                          </div>
                        )}
                      </MagicCard>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: CITATION GROUNDING & HALLUCINATION GUARDRAIL               */}
        {/* ================================================================= */}
        {activeTab === 'grounding' && (
          <div className="space-y-6">
            <MagicCard className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Deterministic + Neural Citation Grounding Guardrail
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Every interview question generated by Interview Forge claims a
                  verbatim resume anchor. This guardrail verifies the anchor via
                  normalized substring matching, RapidFuzz span alignment, token
                  overlap, and bi-encoder semantic entailment—and automatically
                  repairs hallucinated anchors to a real verbatim phrase from
                  the candidate&apos;s resume.
                </p>
              </div>

              <form onSubmit={(e) => handleRunGrounding(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Candidate Resume
                    </label>
                    <select
                      value={groundResumeId}
                      onChange={(e) => setGroundResumeId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {samples.resumes.map((r: any) => (
                        <option key={r.resume_id} value={r.resume_id}>
                          {r.resume_id} — {r.candidate} ({r.role_family})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Claimed Resume Anchor Phrase
                    </label>
                    <Input
                      value={groundAnchor}
                      onChange={(e) => setGroundAnchor(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase text-muted-foreground">
                    Generated Interview Question
                  </label>
                  <Textarea
                    value={groundQuestion}
                    onChange={(e) => setGroundQuestion(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={groundLoading}>
                    <ShieldCheck className="mr-1.5 h-4 w-4" />
                    {groundLoading ? 'Verifying…' : 'Verify Citation Grounding'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const fake =
                        'Led migration of legacy Cobol mainframe billing engine to Rust WebAssembly';
                      setGroundAnchor(fake);
                      handleRunGrounding(undefined, fake);
                    }}
                  >
                    <AlertTriangle className="mr-1.5 h-4 w-4 text-amber-500" />
                    Simulate Hallucinated LLM Anchor
                  </Button>
                </div>
              </form>
            </MagicCard>

            {groundResult && (
              <MagicCard className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div className="flex items-center gap-2.5">
                    {groundResult.status === 'verified' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    <span className="font-mono text-sm font-bold uppercase">
                      Status: {groundResult.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-5 font-mono text-xs">
                    <span>
                      Composite Grounding:{' '}
                      <strong>
                        {(groundResult.grounding_score * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      Exact Substring:{' '}
                      <strong>{groundResult.exact_match ? 'YES' : 'NO'}</strong>
                    </span>
                    <span>
                      Fuzzy Span Ratio:{' '}
                      <strong>
                        {(groundResult.fuzzy_score * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      Semantic Entailment:{' '}
                      <strong>
                        {(groundResult.semantic_support * 100).toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                </div>

                {groundResult.matched_excerpt && (
                  <div>
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                      Closest Verified Resume Bullet (Chunk #
                      {groundResult.matched_chunk_index})
                    </p>
                    <p className="mt-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
                      {groundResult.matched_excerpt}
                    </p>
                  </div>
                )}

                {groundResult.repaired_anchor && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <p className="text-xs font-mono font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                      ✓ Automatic Guardrail Repair Triggered — Re-anchored to
                      Verbatim Resume Span:
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                      “{groundResult.repaired_anchor}”
                    </p>
                  </div>
                )}
              </MagicCard>
            )}
          </div>
        )}
      </main>

      <LandingFooter />
    </div>
  );
}
