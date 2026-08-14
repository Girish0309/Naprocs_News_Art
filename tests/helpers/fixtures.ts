import type { Session } from "next-auth";

/** Shape returned by getServerAuthSession() for a signed-in admin — used wherever a
 * test file mocks that one function to simulate an authenticated request. */
export function fakeSession(adminId: string, overrides: Partial<Session["user"]> = {}): Session {
  return {
    user: { id: adminId, name: "Test Admin", email: "admin@test.local", ...overrides },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}
