"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RowBase = { id: string };

interface State<T extends RowBase> {
  loading: boolean;
  items: T[];
  error: string | null;
  paywall: boolean;
}

export function useLaunchPlanRows<T extends RowBase>(baseUrl: string) {
  const [state, setState] = useState<State<T>>({
    loading: true,
    items: [],
    error: null,
    paywall: false,
  });

  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(baseUrl, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const body = (await res.json()) as { items: T[] };
      setState((s) => ({ ...s, loading: false, items: body.items }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [baseUrl]);

  useEffect(() => {
    reload();
    return () => { abortRef.current?.abort(); };
  }, [reload]);

  const addItem = useCallback(
    async (payload: Omit<T, "id" | "plan_id" | "created_at" | "updated_at">): Promise<T | null> => {
      const tempId = `temp-${Date.now()}`;
      const optimistic = { id: tempId, ...payload } as unknown as T;
      setState((s) => ({ ...s, items: [...s.items, optimistic] }));

      try {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 402) {
          setState((s) => ({
            ...s,
            items: s.items.filter((r) => r.id !== tempId),
            paywall: true,
            error: "Subscription required.",
          }));
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Create failed: ${res.status}`);
        }
        const body = (await res.json()) as { item: T };
        setState((s) => ({
          ...s,
          items: s.items.map((r) => (r.id === tempId ? body.item : r)),
        }));
        return body.item;
      } catch (e) {
        setState((s) => ({
          ...s,
          items: s.items.filter((r) => r.id !== tempId),
          error: (e as Error).message,
        }));
        return null;
      }
    },
    [baseUrl],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<Omit<T, "id" | "plan_id" | "created_at" | "updated_at">>): Promise<boolean> => {
      const prev = state.items.find((r) => r.id === id);
      setState((s) => ({
        ...s,
        items: s.items.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));

      try {
        const res = await fetch(`${baseUrl}/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.status === 402) {
          if (prev) setState((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? prev : r)), paywall: true }));
          return false;
        }
        if (!res.ok) {
          if (prev) setState((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? prev : r)) }));
          const body = await res.json().catch(() => ({}));
          setState((s) => ({ ...s, error: (body as { error?: string }).error ?? "Update failed" }));
          return false;
        }
        const body = (await res.json()) as { item: T };
        setState((s) => ({
          ...s,
          items: s.items.map((r) => (r.id === id ? body.item : r)),
        }));
        return true;
      } catch (e) {
        if (prev) setState((s) => ({ ...s, items: s.items.map((r) => (r.id === id ? prev : r)) }));
        setState((s) => ({ ...s, error: (e as Error).message }));
        return false;
      }
    },
    [baseUrl, state.items],
  );

  const removeItem = useCallback(
    async (id: string): Promise<boolean> => {
      const prev = state.items.find((r) => r.id === id);
      setState((s) => ({ ...s, items: s.items.filter((r) => r.id !== id) }));

      try {
        const res = await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
        if (res.status === 402) {
          if (prev) setState((s) => ({ ...s, items: [...s.items, prev], paywall: true }));
          return false;
        }
        if (!res.ok && res.status !== 204) {
          if (prev) setState((s) => ({ ...s, items: [...s.items, prev] }));
          setState((s) => ({ ...s, error: "Delete failed" }));
          return false;
        }
        return true;
      } catch (e) {
        if (prev) setState((s) => ({ ...s, items: [...s.items, prev] }));
        setState((s) => ({ ...s, error: (e as Error).message }));
        return false;
      }
    },
    [baseUrl, state.items],
  );

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null, paywall: false })), []);

  return {
    loading: state.loading,
    items: state.items,
    error: state.error,
    paywall: state.paywall,
    addItem,
    updateItem,
    removeItem,
    clearError,
  };
}
