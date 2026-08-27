import { redirect } from "next/navigation";
import { auth } from "../../auth";

/**
 * Fetches the session and redirects to /login if there isn't one, so
 * callers get a non-null session back instead of asserting one exists
 * based solely on being rendered under the (app) layout.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}
