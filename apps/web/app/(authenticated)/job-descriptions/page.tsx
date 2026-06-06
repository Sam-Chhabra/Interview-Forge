'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError, type JobDescriptionListItem } from '@/lib/api';

const jdSchema = z.object({
  title: z.string().min(1, 'Title required').max(255),
  company: z.string().max(255).optional(),
  raw_text: z
    .string()
    .min(10, 'Paste the full job description (at least 10 characters)'),
});

type JdValues = z.infer<typeof jdSchema>;

export default function JobDescriptionsPage() {
  const [jds, setJds] = useState<JobDescriptionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JdValues>({
    resolver: zodResolver(jdSchema),
    defaultValues: { title: '', company: '', raw_text: '' },
  });

  useEffect(() => {
    api.jobDescriptions
      .list()
      .then((rows) => setJds(rows))
      .catch((err) => {
        toast.error(
          err instanceof ApiError
            ? err.detail
            : 'Failed to load job descriptions',
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function onSubmit(values: JdValues) {
    try {
      const created = await api.jobDescriptions.create({
        title: values.title,
        company: values.company || undefined,
        raw_text: values.raw_text,
      });
      reset();
      setJds((prev) => [created, ...prev]);
      toast.success('Job description saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to save');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Job Descriptions</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add a job description</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Role title</Label>
              <Input
                id="title"
                aria-invalid={!!errors.title}
                {...register('title')}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company (optional)</Label>
              <Input
                id="company"
                aria-invalid={!!errors.company}
                {...register('company')}
              />
              {errors.company && (
                <p className="text-sm text-destructive">
                  {errors.company.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="raw_text">Job description</Label>
              <Textarea
                id="raw_text"
                className="min-h-[150px]"
                aria-invalid={!!errors.raw_text}
                {...register('raw_text')}
              />
              {errors.raw_text && (
                <p className="text-sm text-destructive">
                  {errors.raw_text.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save job description'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
        ) : jds.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/30">
            <div className="mx-auto h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
              <Briefcase className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium mb-1">No job descriptions yet</p>
            <p className="text-sm text-muted-foreground">
              Add one above to start generating interview questions.
            </p>
          </div>
        ) : (
          jds.map((jd) => (
            <Card
              key={jd.id}
              className="flex flex-row items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{jd.title}</p>
                {jd.company && (
                  <p className="text-sm text-muted-foreground">{jd.company}</p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {new Date(jd.created_at).toLocaleDateString()}
                </span>
                <Link
                  href={`/job-descriptions/${jd.id}`}
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
