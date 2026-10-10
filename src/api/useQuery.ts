import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getVersion, subscribe } from "./db";

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Re-runs after any mutation (the store bumps a version) and whenever `deps` change. */
export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: string | null }>({ data: undefined, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => !cancelled && setState((s) => ({ data: s.data, loading: false, error: e instanceof Error ? e.message : "Erreur inattendue." })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}

export interface MutationError {
  message: string;
  field?: string;
}

export type MutationOutcome<R> = { ok: true; data: R } | { ok: false; error: MutationError };

/**
 * Wraps a mutation with pending/error state and surfaces field errors to forms.
 * `run` resolves to an outcome object (never throws) so callers can branch on `ok`
 * without reading the `error` state, which is stale inside the same event handler.
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MutationError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<MutationOutcome<R>> => {
      setPending(true);
      setError(null);
      try {
        return { ok: true, data: await fn(...args) };
      } catch (e) {
        const field = typeof e === "object" && e && "field" in e ? (e as { field?: string }).field : undefined;
        const err: MutationError = { message: e instanceof Error ? e.message : "Erreur inattendue.", field };
        setError(err);
        return { ok: false, error: err };
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, clearError: () => setError(null) };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
