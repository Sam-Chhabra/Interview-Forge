'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
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
        <nav className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/resumes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Resumes
          </Link>
          <Link
            href="/job-descriptions"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Jobs
          </Link>
          <Link
            href="/interviews/new"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Interviews
          </Link>
          {user && (
            <span className="text-sm text-muted-foreground">
              {user.full_name || user.email}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </nav>
      </div>
    </header>
  );
}
