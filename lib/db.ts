import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

// The MongoDB driver's own default (~30s) is what made a transient Atlas connectivity
// blip hang *every* DB-backed page for 30s before failing (confirmed live —
// audit/final-layout-and-ux-audit.md §A.9). 5s is long enough to ride out a normal
// blip, short enough that a real outage fails fast instead of hanging.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

// Thrown in place of whatever raw driver/network error caused a connection failure, so
// callers (page components, route handlers) can show a calm "try again" fallback for
// this specific, anticipated failure mode instead of a generic crash — without needing
// to inspect a driver-specific error shape that could change across mongoose/mongodb
// driver versions. Deliberately distinct from the "MONGODB_URI is unset" case below,
// which is a deployment misconfiguration, not a transient outage, and stays a plain
// Error so it's loud in the environment where that would actually happen (local setup,
// CI), not swallowed into a "please try again" message that implies retrying would help.
export class DatabaseConnectionError extends Error {
  constructor(cause: unknown) {
    super("Couldn't reach the database.");
    this.name = "DatabaseConnectionError";
    this.cause = cause;
  }
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  listenersAttached: boolean;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

// Cached on `global` (not module scope) so the connection survives Next.js dev
// hot-reloads, which re-evaluate this module on every edit but keep `global` intact.
const cache: MongooseCache = global._mongooseCache ?? {
  conn: null,
  promise: null,
  listenersAttached: false,
};
global._mongooseCache = cache;

function attachConnectionListeners() {
  if (cache.listenersAttached) return;
  cache.listenersAttached = true;

  mongoose.connection.on("error", (error) => {
    console.error("[mongodb] connection error:", error);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[mongodb] disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    console.info("[mongodb] reconnected");
  });
}

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!MONGODB_URI) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Copy .env.local.example to .env.local and set it."
    );
  }

  attachConnectionListeners();

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGODB_URI, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS })
      .catch((error) => {
        // Reset so the next call retries instead of replaying this rejection forever.
        cache.promise = null;
        console.error("[mongodb] failed to connect:", error);
        throw new DatabaseConnectionError(error);
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export default dbConnect;
