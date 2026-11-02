// Intentionally public project configuration, authorized for this HQ.
// This publishable key is designed for browser exposure; RLS controls all data.
// NEVER add a secret/service_role key or credentials to this file.
export const PUBLIC_SUPABASE = {
  url: 'https://gytldbxbvnrxhsprovfm.supabase.co',
  publishableKey: 'sb_publishable_pTW40T6fJqb39O26-PZ9qg_2He2xbpZ',
} as const;
export function publicSupabaseConfig() {
  const envUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Partial overrides fail closed. Never silently mix projects and keys.
  return envUrl!==undefined||envKey!==undefined
    ? {url:envUrl,publishableKey:envKey}
    : PUBLIC_SUPABASE;
}
