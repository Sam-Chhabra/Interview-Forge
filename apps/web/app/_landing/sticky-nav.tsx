import Image from 'next/image';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function StickyNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-muted/40 transition-colors group-hover:border-foreground/30">
            <Image
              src="/logo.svg"
              alt="Interview Forge logo"
              width={20}
              height={20}
              className="h-4 w-4"
              priority
            />
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Interview Forge
          </span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/benchmarks"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
            <span>Under the Hood: AI Lab</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Button asChild size="sm" className="rounded-full px-4 shadow-xs">
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
