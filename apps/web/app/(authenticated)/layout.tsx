'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Navbar } from '@/components/navbar';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.replace('/login');
    }
  }, [accessToken, isLoading, router]);

  // While the auth hydration is in flight or we're about to redirect, render
  // nothing so the protected content never flashes for an unauthenticated user.
  if (isLoading || !accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
