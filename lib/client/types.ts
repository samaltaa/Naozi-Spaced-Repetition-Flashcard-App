import type { ReviewResult, SessionPayload } from "@/lib/services/study";
import type { Question, SessionStep, TestType, Verdict } from "@/lib/srs/types";

export type { Question, ReviewResult, SessionPayload, SessionStep, TestType, Verdict };

// Sessions

export type SessionMode = "learn" | "review";

export interface ReviewRequest {
  id: string;
  itemId: string;
  testType: TestType;
  answer: string;
  responseMs: number;
}

// Dashboard

export interface DashboardCourse {
  courseId: string;
  title: string;
  targetLang: string;
  dueCount: number;
  newAvailable: number;
  learnedCount: number;
  totalItems: number;
}

export interface Dashboard {
  totalDue: number;
  courses: DashboardCourse[];
}

// Courses

export interface CourseItem {
  id: string;
  prompt: string;
  answer: string;
  alternates: string[];
  reading: string | null;
  notes: string | null;
  position: number;
}

export interface CourseLevel {
  id: string;
  title: string;
  position: number;
  items: CourseItem[];
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string;
  source_lang: string;
  target_lang: string;
  diacritic_mode: "strict" | "lenient";
  levels: CourseLevel[];
}