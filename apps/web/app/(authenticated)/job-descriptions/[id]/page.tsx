import { JobDescriptionDetail } from './jd-detail';

export default async function JobDescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobDescriptionDetail id={id} />;
}
