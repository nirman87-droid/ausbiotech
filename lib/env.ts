// Reads settings from environment variables in one place.
// Anything without NEXT_PUBLIC_ stays on the server and never reaches the browser.

export const env = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "ARM Hub <ai-adopt@armhub.example>",
  hubspotToken: process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

// The dev sign-in screen is only offered when Supabase Auth is not set up and we are
// not running a production build (or it was switched on deliberately for a demo).
export const devLoginEnabled =
  !supabaseConfigured && (!env.isProduction || process.env.ALLOW_DEV_LOGIN === "1");
