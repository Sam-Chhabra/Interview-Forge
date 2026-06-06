import { FileText, Briefcase, Sparkles } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    title: 'Upload your resume',
    description: 'Drop your PDF. We extract, chunk, and embed it for retrieval.',
  },
  {
    icon: Briefcase,
    title: 'Paste a job description',
    description: 'We use it to focus questions on what the role actually needs.',
  },
  {
    icon: Sparkles,
    title: 'Practice and improve',
    description: 'Submit answers and get scored on clarity, structure, depth, and relevance.',
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32 border-t">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3 text-center">
        How it works
      </p>
      <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-center mb-16">
        Three steps. No more generic prep.
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 mb-4">
                <Icon className="h-6 w-6 text-zinc-700" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
