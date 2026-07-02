import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both env vars are present, so the UI can show a friendly setup screen otherwise. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * A single browser Supabase client. `null` until the env vars are set.
 * No login: the anon key + permissive RLS policies give everyone with the
 * link full read/write. The URL is the secret.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
