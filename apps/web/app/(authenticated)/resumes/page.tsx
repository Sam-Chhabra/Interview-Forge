'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, type Resume } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.resumes
      .list()
      .then((rows) => {
        setResumes(rows);
        const inProgress = rows
          .filter(
            (r) =>
              r.parse_status === 'pending' || r.parse_status === 'processing',
          )
          .map((r) => r.id);
        if (inProgress.length > 0) setPollingIds(new Set(inProgress));
      })
      .catch((err) => {
        toast.error(
          err instanceof ApiError ? err.detail : 'Failed to load resumes',
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (pollingIds.size === 0) return;

    const intervals: ReturnType<typeof setInterval>[] = [];

    pollingIds.forEach((id) => {
      const interval = setInterval(async () => {
        try {
          const updated = await api.resumes.get(id);
          setResumes((prev) => prev.map((r) => (r.id === id ? updated : r)));
          if (
            updated.parse_status === 'completed' ||
            updated.parse_status === 'failed'
          ) {
            setPollingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            if (updated.parse_status === 'completed') {
              toast.success(`${updated.filename} processed`);
            } else {
              toast.error(`${updated.filename} failed to process`);
            }
          }
        } catch {
          /* transient error — keep polling */
        }
      }, 2000);
      intervals.push(interval);
    });

    return () => intervals.forEach(clearInterval);
  }, [pollingIds]);

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('File exceeds the 10 MB limit');
      return;
    }
    setIsUploading(true);
    try {
      const created = await api.resumes.upload(file);
      setResumes((prev) => [created, ...prev]);
      setPollingIds((prev) => new Set(prev).add(created.id));
      toast.success('Upload started');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // allow re-selecting the same file
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Resumes</h1>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors',
          isDragging ? 'border-primary bg-accent' : 'border-border',
          isUploading && 'pointer-events-none opacity-60',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={onInputChange}
        />
        <p className="text-sm font-medium">
          {isUploading ? 'Uploading…' : 'Drop a PDF here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, up to 10 MB</p>
      </div>

      <div className="space-y-2 mt-8">
        {isLoading ? (
          [0, 1, 2].map((i) => (
            <Card
              key={i}
              className="flex flex-row items-center justify-between p-4"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-24" />
            </Card>
          ))
        ) : resumes.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/30">
            <div className="mx-auto h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium mb-1">No resumes yet</p>
            <p className="text-sm text-muted-foreground">
              Drop a PDF above to get started.
            </p>
          </div>
        ) : (
          resumes.map((r) => (
            <Card
              key={r.id}
              className="flex-row items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={r.parse_status} />
                <Link
                  href={`/resumes/${r.id}`}
                  className="text-sm underline underline-offset-4"
                >
                  View
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
