import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function StickyNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Interview Copilot logo"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="h-6 w-px bg-border" aria-hidden />
          <span className="font-semibold tracking-tight">Interview Copilot</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <Button asChild size="sm">
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
