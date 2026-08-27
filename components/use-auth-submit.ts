import { useState } from "react";

/**
 * Shared pending/error state for the login and register forms, which
 * otherwise duplicate this bookkeeping around two different submit flows
 * (sign-in only vs. register-then-sign-in).
 */
export function useAuthSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  return { error, setError, pending, submit };
}
