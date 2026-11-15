import Link from 'next/link';
import { FlaskConical, Github } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <p className="text-sm font-medium text-foreground">
            Made by Sam · 2026 · MIT licensed
          </p>
          <span className="hidden sm:inline text-muted-foreground">·</span>
          <span className="font-mono text-xs text-muted-foreground">
            Two-Stage Hybrid RAG &amp; Cross-Encoder Evaluation Suite
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/benchmarks"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <FlaskConical className="h-4 w-4" />
            AI Benchmarks
          </Link>
          <Link
            href="https://github.com/Sam-Chhabra/Interview-Forge"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </Link>
        </div>
      </div>
    </footer>
  );
}
