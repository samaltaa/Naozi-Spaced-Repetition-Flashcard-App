"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

// Types

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

// Hook

export function useAsync<T>(load: () => Promise<T>): { state: AsyncState<T>; reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: errorMessage(err, "Something went wrong") });
      });
    return () => {
      active = false;
    };
  }, [load, version]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  return { state, reload };
}