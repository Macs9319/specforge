import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">SpecForge</h1>
      <p className="max-w-md text-gray-600">
        Upload a technical process-flow document and generate a structured
        PRD from it.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="underline">
          Sign in
        </Link>
        <Link href="/register" className="underline">
          Register
        </Link>
      </div>
    </main>
  );
}
