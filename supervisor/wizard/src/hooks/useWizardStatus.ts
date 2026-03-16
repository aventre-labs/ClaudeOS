import { useState, useEffect, useCallback } from "react";
import type { WizardStatus } from "../types";
import { getWizardStatus } from "../api/wizard";

interface UseWizardStatusResult {
  status: WizardStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWizardStatus(): UseWizardStatusResult {
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWizardStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
}
