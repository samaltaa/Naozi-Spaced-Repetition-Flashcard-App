import { SignInForm } from "@/components/auth/SignInForm";
import { safeNext } from "@/lib/auth/env";

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  return <SignInForm next={safeNext(next)} linkError={error === "link"} />;
}