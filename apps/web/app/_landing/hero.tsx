'use client';

import Link from 'next/link';
import { ArrowRight, FileText, FlaskConical, LineChart, MessageSquare } from 'lucide-react';

import { BlurFade, MagicCard } from '@/components/magicui';
import { Hero as LampHero } from '@/components/ui/hero';

const highlights = [
  {
    icon: FileText,
    title: 'Zero generic questions',
    body: 'Every question quotes a real bullet from your resume.',
  },
  {
    icon: MessageSquare,
    title: 'Actionable grading',
    body: 'Scores on clarity, structure, depth and relevance.',
  },
  {
    icon: LineChart,
    title: 'Track progress',
    body: 'Practice across roles and watch your scores climb.',
  },
];

export function Hero() {
  return (
    <LampHero
      className="min-h-[92vh] rounded-none border-b border-border/60 pt-40 pb-10"
      badge={
        <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          AI mock interviews, grounded in your resume
        </span>
      }
      title="Practice interviews built around your actual work."
      subtitle="Upload your resume, paste a job description, and get tailored questions with honest feedback."
      actions={[
        {
          label: (
            <>
              Start practicing
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </>
          ),
          href: '/register',
          variant: 'default',
          className: 'h-11 rounded-full px-6 text-sm',
        },
        {
          label: 'Sign in',
          href: '/login',
          variant: 'outline',
          className: 'h-11 rounded-full px-6 text-sm',
        },
      ]}
      titleClassName="max-w-3xl mx-auto text-4xl sm:text-6xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] tracking-tighter bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent"
      subtitleClassName="mx-auto max-w-[560px] text-base md:text-lg"
      actionsClassName="mt-4"
    >
      <BlurFade delay={0.5} className="mx-auto mt-14 w-full max-w-4xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <MagicCard
              key={title}
              className="border-border/60 bg-card/40 p-5 backdrop-blur"
              gradientColor="rgba(255,255,255,0.06)"
            >
              <Icon className="h-4 w-4 text-foreground/80" />
              <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </MagicCard>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/benchmarks"
            className="group inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>See how the retrieval &amp; grading engine works</span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </BlurFade>
    </LampHero>
  );
}
