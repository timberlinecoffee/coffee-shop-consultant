"use client";

import { useState, useCallback } from "react";

export function useMutationStatus() {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const trackMutation = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }, []);

  const confirmSaved = useCallback(() => {
    setSavedAt(new Date().toISOString());
  }, []);

  return { saving, savedAt, trackMutation, confirmSaved };
}
