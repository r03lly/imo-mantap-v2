// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// When building on Vercel (VERCEL=1 is set automatically there), pin Nitro to the
// Vercel preset so SSR routes + server functions are deployed as Vercel functions.
// Without this, the build emits a Cloudflare Worker bundle and every route other
// than "/" (plus all /api routes and server functions) 404s on *.vercel.app.
const isVercel = !!process.env["VERCEL"] || !!process.env["VERCEL_ENV"];

// Nilai publik proyek Lovable Cloud (publishable key aman di client bundle).
// Dipakai sebagai fallback bila host eksternal (mis. Vercel) belum diisi env varnya,
// sehingga aplikasi tidak crash dengan "Missing Supabase environment variable(s)".
const FALLBACK_SUPABASE_URL = "https://dryziefrdvbetbpoumma.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_otoGfmA4plW8yBu1_xJOHw_fSKjSEyF";
const FALLBACK_SUPABASE_PROJECT_ID = "dryziefrdvbetbpoumma";

const url = process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"] || FALLBACK_SUPABASE_URL;
const key =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  FALLBACK_SUPABASE_PUBLISHABLE_KEY;
const projectId =
  process.env["VITE_SUPABASE_PROJECT_ID"] ||
  process.env["SUPABASE_PROJECT_ID"] ||
  FALLBACK_SUPABASE_PROJECT_ID;

export default defineConfig({
  ...(isVercel ? { nitro: { preset: "vercel" } as const } : {}),
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(projectId),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});


