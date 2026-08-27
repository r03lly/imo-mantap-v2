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

export default defineConfig({
  ...(isVercel ? { nitro: { preset: "vercel" } as const } : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

