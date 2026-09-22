import type { ReviewResult, SessionPayload } from "@/lib/services/study";
import type { Question, SessionStep, TestType, Verdict } from "@/lib/srs/types";
import type {
  CreateLevelInput,
  ItemInput,
  UpdateCourseInput,
  UpdateItemInput,
  UpdateLevelInput,
} from "@/lib/validation";

export type { Question, ReviewResult, SessionPayload, SessionStep, TestType, Verdict };
export type { CreateLevelInput, ItemInput, UpdateCourseInput, UpdateItemInput, UpdateLevelInput };

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

export type Visibility = "private" | "unlisted" | "public";
export type DiacriticMode = "strict" | "lenient";

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

export interface LevelRecord {
  id: string;
  course_id: string;
  title: string;
  position: number;
}

export interface CourseRecord {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  source_lang: string;
  target_lang: string;
  visibility: Visibility;
  diacritic_mode: DiacriticMode;
  new_per_day: number;
  max_reviews_per_day: number;
}

export interface CourseDetail extends CourseRecord {
  is_owner: boolean;
  levels: CourseLevel[];
}

// Account

export interface Me {
  id: string;
  email: string | null;
  username: string;
  timezone: string;
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  timezone: string;
  acceptTerms: boolean;
}

// Editor

export interface CourseFormValues {
  title: string;
  description: string;
  sourceLang: string;
  targetLang: string;
  visibility: Visibility;
  diacriticMode: DiacriticMode;
  newPerDay: number;
  maxReviewsPerDay: number;
}

export interface ItemDraft {
  prompt: string;
  answer: string;
  alternates: string;
  reading: string;
}