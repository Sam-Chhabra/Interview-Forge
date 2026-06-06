import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Github } from 'lucide-react';

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32 md:py-40 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-6">
        Personalized interview prep
      </p>
      <h1 className="mx-auto max-w-3xl text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight">
        Practice the interview you&apos;re actually walking into.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
        Upload your resume, paste a target job description, and get questions
        grounded in your real experience — graded by AI on a four-dimension rubric.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
        <Button asChild size="lg">
          <Link href="/register">
            Get started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="https://github.com/DhyeyShah2805/interview-copilot" target="_blank" rel="noopener noreferrer">
            <Github className="mr-2 h-4 w-4" />
            View on GitHub
          </Link>
        </Button>
      </div>
    </section>
  );
}
