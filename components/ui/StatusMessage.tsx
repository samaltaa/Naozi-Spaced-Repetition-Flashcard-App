import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function StatusMessage({ title, children, action }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-20">
      <p className="text-xl font-extrabold">{title}</p>
      {children ? <div className="mt-2 text-ink/70">{children}</div> : null}
      {action ? (
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center [&>*]:inline-flex [&>*]:min-h-11 [&>*]:items-center [&>*]:justify-center">
          {action}
        </div>
      ) : null}
    </div>
  );
}