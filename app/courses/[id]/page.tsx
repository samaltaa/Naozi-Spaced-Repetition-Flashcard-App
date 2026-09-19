import { CourseView } from "@/components/course/CourseView";

type Props = { params: Promise<{ id: string }> };

export default async function CoursePage({ params }: Props) {
  const { id } = await params;
  return <CourseView courseId={id} />;
}