import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import Admin from "@/models/Admin";
import { sessionCookieName, useSecureCookies } from "@/lib/auth-cookie-config";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";

// Fixed, never-a-real-admin's bcrypt hash, compared against when no matching admin is
// found — keeps authorize()'s response time constant whether or not the email exists,
// so measuring latency can't be used to enumerate valid admin emails.
const DUMMY_PASSWORD_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8Y6c2rl2Vc0z1yGxTBu1zM6oR8U7CO";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Authoritative enforcement point: this runs for every credential check no
        // matter how it's triggered, unlike the /api/admin/login pre-flight route (a
        // client-side UX nicety the login form happens to call first, but which can be
        // skipped entirely by anyone hitting this endpoint directly). Keyed by IP alone,
        // so switching emails doesn't reset the budget.
        const ip = getClientIp(req.headers);
        const { success } = await rateLimit(`login:${ip}`, 5, "15m");
        if (!success) {
          return null;
        }

        await dbConnect();
        const admin = await Admin.findOne({ email: credentials.email.toLowerCase() });

        // Always compare against *some* bcrypt hash, even when no admin matched, so
        // this takes the same amount of time either way — otherwise response latency
        // alone reveals whether an email is registered.
        const isValidPassword = await bcrypt.compare(credentials.password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
        if (!admin || !isValidPassword) {
          return null;
        }

        admin.last_login_at = new Date();
        await admin.save();

        return {
          id: admin.id,
          name: admin.name,
          email: admin.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};

export async function getServerAuthSession() {
  return getServerSession(authOptions);
}

export async function requireAdminSession() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}
