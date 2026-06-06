'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  api,
  ApiError,
  type JobDescriptionListItem,
  type Resume,
} from '@/lib/api';

const schema = z.object({
  resume_id: z.string().uuid('Pick a resume'),
  job_description_id: z.string().uuid('Pick a job description'),
  num_questions: z.number().int().min(4).max(12),
});

type FormValues = z.infer<typeof schema>;

export default function NewInterviewPage() {
  const router = useRouter();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jds, setJds] = useState<JobDescriptionListItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resume_id: '', job_description_id: '', num_questions: 8 },
  });

  useEffect(() => {
    Promise.all([api.resumes.list(), api.jobDescriptions.list()])
      .then(([resumeRows, jdRows]) => {
        setResumes(resumeRows.filter((r) => r.parse_status === 'completed'));
        setJds(jdRows);
      })
      .catch((err) => {
        toast.error(
          err instanceof ApiError ? err.detail : 'Failed to load your data',
        );
      })
      .finally(() => setIsLoadingData(false));
  }, []);

  const noResumes = !isLoadingData && resumes.length === 0;
  const noJds = !isLoadingData && jds.length === 0;
  const blocked = noResumes || noJds;

  async function onSubmit(values: FormValues) {
    setIsGenerating(true);
    try {
      const session = await api.interviews.create({
        resume_id: values.resume_id,
        job_description_id: values.job_description_id,
        num_questions: values.num_questions,
      });
      router.push(`/interviews/${session.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.detail : 'Failed to generate interview',
      );
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Start a Mock Interview</h1>

      <Card>
        <CardHeader>
          <CardTitle>Interview setup</CardTitle>
        </CardHeader>
        <CardContent>
          {noResumes && (
            <p className="mb-4 text-sm text-muted-foreground">
              You need at least one processed resume.{' '}
              <Link href="/resumes" className="underline underline-offset-4">
                Upload one →
              </Link>
            </p>
          )}
          {noJds && (
            <p className="mb-4 text-sm text-muted-foreground">
              You need at least one job description.{' '}
              <Link
                href="/job-descriptions"
                className="underline underline-offset-4"
              >
                Add one →
              </Link>
            </p>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="resume_id">Resume</Label>
              {isLoadingData ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Controller
                  name="resume_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={blocked || isGenerating}
                    >
                      <SelectTrigger id="resume_id">
                        <SelectValue placeholder="Select a resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {resumes.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.filename}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {errors.resume_id && (
                <p className="text-sm text-destructive">
                  {errors.resume_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_description_id">Job description</Label>
              {isLoadingData ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Controller
                  name="job_description_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={blocked || isGenerating}
                    >
                      <SelectTrigger id="job_description_id">
                        <SelectValue placeholder="Select a job description" />
                      </SelectTrigger>
                      <SelectContent>
                        {jds.map((jd) => (
                          <SelectItem key={jd.id} value={jd.id}>
                            {jd.company
                              ? `${jd.title} — ${jd.company}`
                              : jd.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              {errors.job_description_id && (
                <p className="text-sm text-destructive">
                  {errors.job_description_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="num_questions">Number of questions</Label>
              <Input
                id="num_questions"
                type="number"
                min={4}
                max={12}
                disabled={blocked || isGenerating || isLoadingData}
                {...register('num_questions', { valueAsNumber: true })}
              />
              {errors.num_questions && (
                <p className="text-sm text-destructive">
                  {errors.num_questions.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={blocked || isGenerating || isLoadingData}
            >
              {isGenerating ? 'Generating…' : 'Generate interview'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Generation takes ~5-10 seconds — the model is reading your resume
              and JD.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
