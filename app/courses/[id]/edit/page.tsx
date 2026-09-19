import { CourseEditor } from "@/components/editor/CourseEditor";

type Props = { params: Promise<{ id: string }> };

export default async function EditCoursePage({ params }: Props) {
  const { id } = await params;
  return <CourseEditor courseId={id} />;
}