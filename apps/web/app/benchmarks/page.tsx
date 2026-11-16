'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  FlaskConical,
  GitCompare,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { LandingFooter } from '@/app/_landing/footer';
import {
  BlurFade,
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
    label: 'Acronym Match (ANN → Faiss/ScaNN)',
    resumeId: 'r01',
    query:
      'Experience with Approximate Nearest Neighbor (ANN) vector retrieval at scale',
  },
  {
    label: 'Paraphrase (Visual Regression → Playwright)',
    resumeId: 'r04',
    query:
      'Experience preventing UI regressions through automated cross-browser end-to-end and visual snapshot testing',
  },
  {
    label: 'Cloud & Kubernetes (SRE)',
    resumeId: 'r05',
    query:
      'Multi-region Kubernetes cluster operations and Infrastructure-as-Code with Terraform',
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
  const [fitStrategy] = useState('hybrid_rerank_bge');
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
  const [groundRationale] = useState(
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
      {/* Top Bar with Clear Separation Back to the Main App */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-muted/40">
                <Image
                  src="/logo.svg"
                  alt="Interview Forge"
                  width={20}
                  height={20}
                  className="h-4 w-4 dark:invert"
                />
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Interview Forge
              </span>
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
              Under the Hood: AI Lab
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRerunBenchmarks}
              disabled={rerunning}
              className="hidden sm:inline-flex text-xs font-mono text-muted-foreground"
            >
              <RefreshCw
                className={cn('mr-1.5 h-3.5 w-3.5', rerunning && 'animate-spin')}
              />
              {rerunning ? 'Running…' : 'Re-run Suite'}
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full text-xs">
              <Link href="/">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to Product
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Compact, Clean Header */}
      <section className="relative overflow-hidden border-b border-border/60 bg-muted/15">
        <GridPattern
          width={36}
          height={36}
          className="[mask-image:radial-gradient(600px_circle_at_top,white,transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-12">
          <BlurFade delay={0.04}>
            <p className="font-mono text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Engineering Benchmarks · 12 Resumes · 160 Queries
            </p>
            <h1 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight">
              How Interview Forge retrieves &amp; verifies resume evidence
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">
              Compare 8 search methods, 5 resume-splitting strategies, and live
              hallucination checks on our evaluation dataset.
            </p>
          </BlurFade>

          {/* 4 Clean KPI Cards (No BorderBeam, Minimal Text) */}
          {report && (
            <BlurFade delay={0.1} className="mt-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Search Accuracy (nDCG@5)</span>
                    <Cpu className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={retrieval.hybrid_rerank_bge?.ndcg_at_5?.mean || 0.749}
                      decimals={3}
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      +18.3% Lift
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Hybrid RRF + Reranker vs. standard vector search (0.633)
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Top-5 Evidence Recall</span>
                    <Layers className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2.5">
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
                      6.5× Cleaner
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Bullet-level splitting lifts signal-to-noise from 8% → 53%
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Verified Resume Quotes</span>
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={
                        (grounding.post_repair_grounded_rate || 1.0) * 100
                      }
                      decimals={0}
                      suffix="%"
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      F1 = 1.00
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Catches &amp; repairs fabricated LLM resume citations
                  </p>
                </MagicCard>

                <MagicCard className="p-5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <span>Answer Grader Accuracy</span>
                    <Activity className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <NumberTicker
                      value={
                        (grader.rubric_evaluator?.pairwise_accuracy || 0.917) *
                        100
                      }
                      decimals={1}
                      suffix="%"
                      className="text-3xl font-bold font-mono"
                    />
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                      ρ = 0.83
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    100% immune to long, buzzword-stuffed rambling answers
                  </p>
                </MagicCard>
              </div>
            </BlurFade>
          )}
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 space-y-8">
        {/* Simple 4-Tab Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  key: 'benchmarks',
                  label: '1. Benchmark Results',
                  icon: FlaskConical,
                },
                {
                  key: 'arena',
                  label: '2. Compare Search Live',
                  icon: GitCompare,
                },
                {
                  key: 'fitgap',
                  label: '3. Resume vs. Job Match',
                  icon: Layers,
                },
                {
                  key: 'grounding',
                  label: '4. Quote Fact-Checker',
                  icon: ShieldCheck,
                },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                size="sm"
                variant={activeTab === key ? 'default' : 'outline'}
                className="rounded-full px-4"
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
        {/* TAB 1: CLEAN BENCHMARK TABLES & 2 EXAMPLES                        */}
        {/* ================================================================= */}
        {!loading && activeTab === 'benchmarks' && report && (
          <div className="space-y-10">
            {/* TABLE 1: RETRIEVAL COMPARISON */}
            <section className="space-y-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  1. Search Strategy Comparison
                </h2>
                <p className="text-sm text-muted-foreground">
                  Combining keyword search + vector search + neural reranking
                  beats single-method search by +18.3%.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/50 font-mono text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4">Search Method</th>
                      <th className="py-3 px-4">Accuracy (nDCG@5)</th>
                      <th className="py-3 px-4">Top-3 Recall</th>
                      <th className="py-3 px-4">Top-5 Recall</th>
                      <th className="py-3 px-4">First-Hit Rank (MRR)</th>
                      <th className="py-3 px-4">Speed</th>
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
                          <td className="py-3 px-4">
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
                                  BEST
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={row.ndcg_at_5.mean}
                              highlight={isHighlight}
                              color={isHighlight ? 'emerald' : 'zinc'}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={row.recall_at_3.mean}
                              highlight={isHighlight}
                              color={isHighlight ? 'blue' : 'zinc'}
                              showPercent
                            />
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {(row.recall_at_5.mean * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 font-mono font-medium">
                            {row.mrr_at_10.mean.toFixed(3)}
                          </td>
                          <td className="py-3 px-4 font-mono text-muted-foreground">
                            {row.latency_p50_ms}ms
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* TABLE 2: CHUNKING COMPARISON */}
            <section className="space-y-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  2. Resume Splitting (Chunking) Comparison
                </h2>
                <p className="text-sm text-muted-foreground">
                  Splitting by bullet point with{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    [Section | Role]
                  </code>{' '}
                  headers gives 6.5× cleaner context than 500-word blocks.
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/70 bg-muted/50 font-mono text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-4">Splitting Method</th>
                      <th className="py-3 px-4">Avg Chunk Size</th>
                      <th className="py-3 px-4">Recall (150-Token Budget)</th>
                      <th className="py-3 px-4">Focus Score (nDCG@5)</th>
                      <th className="py-3 px-4">Signal vs. Noise (SNR@3)</th>
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
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span>{row.label}</span>
                              {isBest && (
                                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  DEFAULT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {row.avg_tokens_per_chunk} words
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={row.recall_at_150tok.mean}
                              highlight={isBest}
                              color="blue"
                              showPercent
                            />
                          </td>
                          <td className="py-3 px-4">
                            <MetricBar
                              value={row.f_ndcg_at_5.mean}
                              highlight={isBest}
                              color="emerald"
                            />
                          </td>
                          <td className="py-3 px-4">
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

            {/* 2 CONCISE EXAMPLES */}
            {report.case_studies?.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">
                    3. Real Examples: Basic Vector Search vs. Hybrid + Reranker
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Examples where standard vector search picked the wrong line,
                    while Hybrid + Reranking found the exact match.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {report.case_studies
                    .filter((cs: any) => cs.dense_top1 !== cs.hybrid_rerank_top1)
                    .slice(0, 2)
                    .map((cs: any) => (
                    <MagicCard key={cs.qid} className="p-5 space-y-3">
                      <p className="text-sm font-semibold text-foreground">
                        Query: “{cs.query}”
                      </p>

                      <div className="space-y-2 text-xs">
                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-2.5">
                          <span className="font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            ✗ Basic Vector Search Picked:
                          </span>
                          <p className="mt-1 text-muted-foreground">
                            {cs.dense_top1}
                          </p>
                        </div>

                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2.5">
                          <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            ✓ Hybrid + Reranker Picked:
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
        {/* TAB 2: COMPARE SEARCH LIVE                                        */}
        {/* ================================================================= */}
        {activeTab === 'arena' && (
          <div className="space-y-6">
            <MagicCard className="p-6">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">
                    Compare Search Methods Live
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Pick a preset or type any job requirement to see how each
                    search method ranks the candidate&apos;s resume bullets.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase text-muted-foreground mr-1">
                    Try a preset:
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
                  className="grid gap-4 pt-1 sm:grid-cols-12"
                >
                  <div className="sm:col-span-4">
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Resume
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
                      Splitting Method
                    </label>
                    <select
                      value={arenaChunkStrategy}
                      onChange={(e) => setArenaChunkStrategy(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-xs sm:text-sm"
                    >
                      <option value="bullet_contextual">
                        Contextual Bullets (Default)
                      </option>
                      <option value="sentence_window">Sentence Window</option>
                      <option value="fixed_200_30">Fixed 200 Words</option>
                      <option value="fixed_500_50">Legacy 500 Words</option>
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    <label className="text-xs font-mono uppercase text-muted-foreground">
                      Job Requirement Query
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
                        <span className="text-sm font-semibold">
                          {strat.label}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {strat.latency_ms}ms
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {strat.results.map((hit: any, idx: number) => (
                          <div
                            key={hit.chunk_index}
                            className={cn(
                              'rounded-lg border p-3 text-xs space-y-1.5',
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
                                #{idx + 1}
                              </span>
                              <span className="text-muted-foreground">
                                Score {hit.score.toFixed(2)}
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
        {/* TAB 3: RESUME VS JOB MATCH                                        */}
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
                    Target Job Description
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
                  {fitLoading ? 'Analyzing…' : 'Analyze Fit & Gaps'}
                </Button>
              </form>
            </MagicCard>

            {fitResult && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                      Overall Role Fit
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono">
                      {fitResult.overall_fit_score}%
                    </p>
                  </MagicCard>
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-emerald-600 dark:text-emerald-400">
                      Covered
                    </p>
                    <p className="mt-1 text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {fitResult.counts.strong_match}
                    </p>
                  </MagicCard>
                  <MagicCard className="p-4">
                    <p className="text-xs font-mono uppercase text-amber-600 dark:text-amber-400">
                      Partial
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
                              Matched Resume Bullet:{' '}
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
        {/* TAB 4: QUOTE FACT-CHECKER                                         */}
        {/* ================================================================= */}
        {activeTab === 'grounding' && (
          <div className="space-y-6">
            <MagicCard className="p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Resume Quote Fact-Checker
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Checks whether a quote cited by the AI interviewer actually
                  exists in the candidate&apos;s resume, and repairs made-up
                  quotes automatically.
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
                      Resume Quote Claimed by AI
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
                    Interview Question
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
                    {groundLoading ? 'Checking…' : 'Verify Quote'}
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
                    Test with a Fake / Hallucinated Quote
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
                      Match Confidence:{' '}
                      <strong>
                        {(groundResult.grounding_score * 100).toFixed(0)}%
                      </strong>
                    </span>
                    <span>
                      Exact Quote:{' '}
                      <strong>{groundResult.exact_match ? 'YES' : 'NO'}</strong>
                    </span>
                  </div>
                </div>

                {groundResult.matched_excerpt && (
                  <div>
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                      Closest Real Bullet in Resume
                    </p>
                    <p className="mt-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 font-mono text-xs">
                      {groundResult.matched_excerpt}
                    </p>
                  </div>
                )}

                {groundResult.repaired_anchor && (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                    <p className="text-xs font-mono font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                      ✓ Auto-Repaired to Real Resume Quote:
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
