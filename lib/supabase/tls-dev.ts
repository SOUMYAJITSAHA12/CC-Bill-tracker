/**
 * Dev-only: corporate SSL inspection breaks Supabase TLS in Node.
 * Set SUPABASE_INSECURE_TLS=true in .env.local (never in production).
 */
if (process.env.SUPABASE_INSECURE_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
