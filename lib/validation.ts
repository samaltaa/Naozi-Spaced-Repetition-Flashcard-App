import { z } from "zod";

// Primitives

const Text = (max: number) => z.string().trim().min(1).max(max);

export const LangCode = z.string().trim().min(2).max(15);
export const Visibility = z.enum(["private", "unlisted", "public"]);
export const DiacriticMode = z.enum(["strict", "lenient"]);
export const TestType = z.enum(["multiple_choice", "typing"]);

// Courses

export const CreateCourseInput = z.object({
  title: Text(120),
  description: z.string().trim().max(2000).optional(),
  sourceLang: LangCode,
  targetLang: LangCode,
  visibility: Visibility.optional(),
  diacriticMode: DiacriticMode.optional(),
  newPerDay: z.int().min(1).max(100).optional(),
  maxReviewsPerDay: z.int().min(1).max(2000).optional(),
});

export const UpdateCourseInput = CreateCourseInput.partial();

// Levels

export const CreateLevelInput = z.object({
  title: Text(120),
});

export const UpdateLevelInput = z.object({
  title: Text(120).optional(),
  position: z.int().min(0).optional(),
});

// Items

export const ItemInput = z.object({
  prompt: Text(500),
  answer: Text(500),
  alternates: z.array(Text(500)).max(20).optional(),
  reading: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const CreateItemsInput = z.union([ItemInput, z.array(ItemInput).min(1).max(1000)]);

export const UpdateItemInput = ItemInput.partial();

// Accounts

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "Usernames use 3 to 20 lowercase letters, numbers or underscores.");

export const SignUpInput = z.object({
  username: Username,
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Passwords need at least 8 characters.")
    .max(72, "Passwords can be at most 72 characters."),
  timezone: z.string().max(64).refine(isTimeZone).catch("UTC"),
  acceptTerms: z.literal(true, "Accept the terms to create an account."),
});

// Reviews

export const ReviewSubmission = z.object({
  id: z.guid(),
  itemId: z.guid(),
  testType: TestType,
  answer: z.string().max(500),
  responseMs: z.int().min(0).max(600_000),
});

// Inferred types

export type CreateCourseInput = z.infer<typeof CreateCourseInput>;
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;
export type CreateLevelInput = z.infer<typeof CreateLevelInput>;
export type UpdateLevelInput = z.infer<typeof UpdateLevelInput>;
export type ItemInput = z.infer<typeof ItemInput>;
export type CreateItemsInput = z.infer<typeof CreateItemsInput>;
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;
export type ReviewSubmission = z.infer<typeof ReviewSubmission>;
export type SignUpInput = z.infer<typeof SignUpInput>;