import Link from 'next/link';
import { Github } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Built by Dhyey Shah · 2026 · MIT licensed
        </p>
        <Link
          href="https://github.com/DhyeyShah2805/interview-copilot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Github className="h-4 w-4" />
          View on GitHub
        </Link>
      </div>
    </footer>
  );
}
