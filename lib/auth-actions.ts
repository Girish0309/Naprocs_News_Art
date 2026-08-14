"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName } from "@/lib/auth-cookie-config";

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  redirect("/admin/login");
}
