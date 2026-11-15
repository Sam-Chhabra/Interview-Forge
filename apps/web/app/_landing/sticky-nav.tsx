import Image from 'next/image';
import Link from 'next/link';
import { Activity, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StickyNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-muted/40 transition-colors group-hover:border-foreground/30">
            <Image
              src="/logo.svg"
              alt="Interview Forge logo"
              width={24}
              height={24}
              className="h-5 w-5"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight leading-none">
              Interview Forge
            </span>
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Hybrid RAG · Evaluation Lab
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/benchmarks"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 transition-all hover:border-emerald-500/60 hover:bg-emerald-500/15"
          >
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span>AI Benchmarks &amp; RAG Lab</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Button asChild size="sm" className="rounded-full px-4 shadow-xs">
            <Link href="/register">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Get started
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
