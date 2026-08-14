import dns from "node:dns";
import mongoose from "mongoose";

if (process.env.NODE_ENV !== "production") {
  // Some Windows setups hand Node a link-local IPv6 DNS server that fails SRV
  // lookups, which mongodb+srv:// URIs depend on. Public resolvers avoid this.
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const MONGODB_URI = process.env.MONGODB_URI;

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
    cache.promise = mongoose.connect(MONGODB_URI).catch((error) => {
      // Reset so the next call retries instead of replaying this rejection forever.
      cache.promise = null;
      console.error("[mongodb] failed to connect:", error);
      throw error;
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export default dbConnect;
