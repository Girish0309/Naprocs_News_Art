import { NextResponse } from "next/server";
import { DatabaseConnectionError } from "@/lib/db";

/**
 * Wraps a Route Handler so a DatabaseConnectionError (a transient outage — see
 * lib/db.ts and audit/final-layout-and-ux-audit.md §A.9) returns a calm 503 instead of
 * an unhandled crash. Every other error still propagates unchanged; this only catches
 * the one specific, anticipated failure mode, not a general try/catch-everything.
 */
export function withDbErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof DatabaseConnectionError) {
        console.error("[api] database unavailable:", error);
        return NextResponse.json(
          { error: "We're having trouble reaching the database right now. Please try again in a moment." },
          { status: 503 }
        );
      }
      throw error;
    }
  };
}
