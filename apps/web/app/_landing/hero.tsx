'use client';

import Link from 'next/link';
import { ArrowRight, Cpu, FlaskConical, Github, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AnimatedShinyBadge,
  BlurFade,
  BorderBeam,
  DotPattern,
  MagicCard,
  NumberTicker,
} from '@/components/magicui';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className="[mask-image:radial-gradient(650px_circle_at_center,white,transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <BlurFade delay={0.05} className="flex flex-col items-center text-center">
          <AnimatedShinyBadge>
            <span>Two-Stage Hybrid RAG · Cross-Encoder Reranking · Verified Citations</span>
          </AnimatedShinyBadge>

          <h1 className="mt-7 max-w-4xl text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.06] bg-gradient-to-b from-foreground via-foreground/95 to-foreground/65 bg-clip-text text-transparent">
            Precision AI interview prep grounded in your actual work.
          </h1>

          <p className="mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Interview Forge decomposes target job descriptions into atomic engineering
            requirements, retrieves evidence from your resume via{' '}
            <span className="font-medium text-foreground">
              Reciprocal Rank Fusion &amp; Neural Cross-Encoder Reranking
            </span>
            , enforces verbatim citation guardrails, and evaluates answers on a
            length-deconfounded senior rubric.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-medium shadow-sm">
              <Link href="/benchmarks">
                <FlaskConical className="mr-2 h-4 w-4" />
                Explore AI/ML Benchmark Lab
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-6 text-sm">
              <Link href="/register">
                Start Mock Interview
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-11 rounded-full px-5 text-sm">
              <Link
                href="https://github.com/Sam-Chhabra/Interview-Forge"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-4 w-4" />
                GitHub
              </Link>
            </Button>
          </div>
        </BlurFade>

        {/* Live Telemetry Showcase Strip */}
        <BlurFade delay={0.18} className="mt-16">
          <div className="relative rounded-2xl border border-border/80 bg-card/60 p-1.5 shadow-xl backdrop-blur-md">
            <BorderBeam size={180} duration={10} colorFrom="#10b981" colorTo="#3b82f6" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MagicCard className="border-border/50 bg-background/80 p-5">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <span>Hybrid + Rerank nDCG@5</span>
                  <Cpu className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <NumberTicker
                    value={0.749}
                    decimals={3}
                    className="text-3xl font-bold font-mono text-foreground"
                  />
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    +18.3% vs Dense
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  p = 0.0005 paired permutation test (1,000-sample bootstrap CI)
                </p>
              </MagicCard>

              <MagicCard className="border-border/50 bg-background/80 p-5">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <span>Contextual Signal-to-Noise</span>
                  <Sparkles className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <NumberTicker
                    value={52.7}
                    decimals={1}
                    suffix="%"
                    className="text-3xl font-bold font-mono text-foreground"
                  />
                  <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-600 dark:text-blue-400">
                    6.5x vs 500-tok
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Anthropic-style [Section | Role] atomic bullet chunking
                </p>
              </MagicCard>

              <MagicCard className="border-border/50 bg-background/80 p-5">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <span>Citation Grounding Rate</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <NumberTicker
                    value={100}
                    decimals={1}
                    suffix="%"
                    className="text-3xl font-bold font-mono text-foreground"
                  />
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    AUROC 1.000
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Verbatim substring + RapidFuzz span + auto-repair guardrail
                </p>
              </MagicCard>

              <MagicCard className="border-border/50 bg-background/80 p-5">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <span>ResumeJD-Bench v1</span>
                  <FlaskConical className="h-4 w-4 text-amber-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <NumberTicker
                    value={160}
                    decimals={0}
                    suffix=" Queries"
                    className="text-3xl font-bold font-mono text-foreground"
                  />
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs font-medium text-amber-600 dark:text-amber-400">
                    324 Bullets
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  12 roles · 5 match types · 64-answer length-confound audit
                </p>
              </MagicCard>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
