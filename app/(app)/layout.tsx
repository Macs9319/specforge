import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

// Auth is gated here per Next.js's own guidance to check session in each
// server function/layout rather than centralizing it in proxy/middleware
// (which Server Actions can bypass): every protected page must live under
// this (app) route group to inherit the redirect below.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-gray-200 p-4">
        <span className="font-semibold">SpecForge</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-sm underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}
