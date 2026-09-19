import { SessionRunner } from "@/components/session/SessionRunner";

type Props = { params: Promise<{ id: string }> };

export default async function LearnPage({ params }: Props) {
  const { id } = await params;
  return <SessionRunner courseId={id} mode="learn" />;
}