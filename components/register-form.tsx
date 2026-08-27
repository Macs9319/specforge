"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuthSubmit } from "./use-auth-submit";

export function RegisterForm() {
  const router = useRouter();
  const { error, setError, pending, submit } = useAuthSubmit();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    submit(async () => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Account created. Please sign in.");
        router.push("/login");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-3"
    >
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        autoComplete="email"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <input
        name="password"
        type="password"
        placeholder="Password (min. 8 characters)"
        required
        minLength={8}
        autoComplete="new-password"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
