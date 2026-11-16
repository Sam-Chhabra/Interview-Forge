'use client';

import { FlaskConical } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/resumes', label: 'Resumes' },
    { href: '/job-descriptions', label: 'Jobs' },
    { href: '/interviews/new', label: 'Interviews' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Interview Copilot logo"
            width={30}
            height={30}
            className="h-7 w-7"
            priority
          />
          <span className="h-5 w-px bg-border" aria-hidden />
          <span className="font-semibold tracking-tight text-sm">Interview Copilot</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          {user &&
            navItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          <Link
            href="/benchmarks"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
              pathname === '/benchmarks'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'border-emerald-500/25 bg-emerald-500/5 text-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10',
            )}
          >
            <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
            <span>AI Lab</span>
          </Link>
          {user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-border/60">
              <span className="hidden md:inline text-xs font-mono text-muted-foreground">
                {user.full_name || user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 text-xs">
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-border/60">
              <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="h-8 text-xs rounded-full px-3.5">
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
