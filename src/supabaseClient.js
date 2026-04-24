// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const hasPlaceholderUrl = /your-project-ref|example\.supabase\.co/i.test(url);
const hasPlaceholderKey = /your-anon-key/i.test(anon);

if (!url || !anon || hasPlaceholderUrl || hasPlaceholderKey) {
  throw new Error(
    "Invalid Supabase env vars. Set real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in crm_app/.env.local."
  );
}

const SUPABASE_REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(input, init = {}) {
  const timeoutController = new AbortController();
  const externalSignal = init?.signal;
  let timeoutId = null;
  let removeExternalAbort = null;

  const abortFromExternal = () => {
    try {
      timeoutController.abort(externalSignal?.reason);
    } catch {
      timeoutController.abort();
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener("abort", abortFromExternal);
    }
  }

  timeoutId = setTimeout(() => {
    timeoutController.abort(new Error("Supabase request timeout"));
  }, SUPABASE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: timeoutController.signal });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (removeExternalAbort) removeExternalAbort();
  }
}

// Some Chromium builds can freeze navigator.locks across tab visibility changes.
// Supabase auth-js then hangs while waiting for the lock before any request.
// We use a no-op lock to avoid cross-tab deadlocks for CRM editors.
async function authLockNoOp(_name, _acquireTimeout, fn) {
  return await fn();
}

export const supabase = createClient(url, anon, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: authLockNoOp,
  },
});
