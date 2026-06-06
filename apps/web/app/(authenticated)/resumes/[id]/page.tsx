import { ResumeDetail } from './resume-detail';

export default async function ResumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResumeDetail id={id} />;
}
