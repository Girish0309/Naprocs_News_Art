const REQUIRED_ENV_VARS = ["MONGODB_URI", "NEXTAUTH_SECRET"] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.local.example to .env.local and fill in the missing values before starting the app."
    );
  }
}
