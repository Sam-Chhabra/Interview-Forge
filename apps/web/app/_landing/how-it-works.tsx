'use client';

import { Award, Briefcase, Upload } from 'lucide-react';
import { MagicCard } from '@/components/magicui';

const steps = [
  {
    step: 'STEP 01',
    icon: Upload,
    title: 'Upload your resume',
    description:
      'Drop in your PDF once. Interview Forge extracts your experience, projects, and technical skills automatically.',
  },
  {
    step: 'STEP 02',
    icon: Briefcase,
    title: 'Paste the job description',
    description:
      'Add the role you are targeting. We match its requirements against your resume to spot strengths and gaps.',
  },
  {
    step: 'STEP 03',
    icon: Award,
    title: 'Practice & get scored',
    description:
      'Answer tailored interview questions and get instant feedback across clarity, structure, depth, and relevance.',
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <div className="flex flex-col items-center text-center mb-12">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          How It Works
        </p>
        <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Ready in under a minute
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {steps.map((item) => {
          const Icon = item.icon;
          return (
            <MagicCard key={item.step} className="p-6">
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-border/80 bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                  {item.step}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-muted/40">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </MagicCard>
          );
        })}
      </div>
    </section>
  );
}
