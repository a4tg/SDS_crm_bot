// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Вариант А (рекомендуется): ключи из .env
const URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback: если .env ещё не настроен — временно подставь свои значения
// (не держи их в коде на проде!)
const url  = URL  || "https://sqirjcfgqoybskqdiltw.supabase.co";
const anon = ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxaXJqY2ZncW95YnNrcWRpbHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTQyOTEsImV4cCI6MjA3Nzg3MDI5MX0.BDSS-gH341YGWb0usM34EoUxJEloFKVursoJtolkesA";

export const supabase = createClient(url, anon);
