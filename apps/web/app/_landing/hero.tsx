'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileText, FlaskConical, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AnimatedShinyBadge,
  BlurFade,
  DotPattern,
  MagicCard,
} from '@/components/magicui';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className="[mask-image:radial-gradient(600px_circle_at_center,white,transparent)]"
      />
      <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-20 sm:pt-28 sm:pb-24">
        <BlurFade delay={0.05} className="flex flex-col items-center text-center">
          <AnimatedShinyBadge>
            <span>AI Mock Interviews · Grounded in Your Resume</span>
          </AnimatedShinyBadge>

          <h1 className="mt-6 max-w-3xl text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08] bg-gradient-to-b from-foreground via-foreground/95 to-foreground/65 bg-clip-text text-transparent">
            Practice interviews built around your actual work.
          </h1>

          <p className="mt-5 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Upload your resume and paste a job description. Get tailored
            interview questions and clear, rubric-based feedback on every answer.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm font-medium shadow-sm">
              <Link href="/register">
                Start Practicing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-6 text-sm">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </BlurFade>

        {/* Clean 3-Card Product Highlights */}
        <BlurFade delay={0.16} className="mt-14">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MagicCard className="p-5">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-emerald-500" />
                <span>Zero Generic Questions</span>
              </div>
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Every question quotes a real bullet from your resume matched to
                the target job.
              </p>
            </MagicCard>

            <MagicCard className="p-5">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span>Actionable Grading</span>
              </div>
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Instant 1–5 scores on clarity, structure, depth, and relevance
                with specific tips.
              </p>
            </MagicCard>

            <MagicCard className="p-5">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Track Your Progress</span>
              </div>
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Practice across multiple roles and watch your scores improve
                session by session.
              </p>
            </MagicCard>
          </div>

          {/* Subtle Separation Callout for Engineering / AI Lab */}
          <div className="mt-6 flex justify-center">
            <Link
              href="/benchmarks"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
            >
              <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
              <span>
                Curious how the retrieval &amp; grading engine works under the
                hood?
              </span>
              <span className="font-medium text-foreground underline-offset-4 hover:underline">
                View AI Lab →
              </span>
            </Link>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
