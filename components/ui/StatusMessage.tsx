import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function StatusMessage({ title, children, action }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <p className="text-xl font-extrabold">{title}</p>
      {children ? <div className="mt-2 text-ink/70">{children}</div> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}