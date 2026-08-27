import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

const FALLBACK_URL = "https://dryziefrdvbetbpoumma.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_otoGfmA4plW8yBu1_xJOHw_fSKjSEyF";

function createCloudFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireCloudAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const url = process.env["SUPABASE_URL"] || FALLBACK_URL;
    const publishableKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || FALLBACK_PUBLISHABLE_KEY;
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Sesi login tidak ditemukan. Silakan masuk kembali.");
    }

    const token = authHeader.slice("Bearer ".length);
    if (!token || token.split(".").length !== 3) {
      throw new Error("Sesi login tidak valid. Silakan masuk kembali.");
    }

    const supabase = createClient<Database>(url, publishableKey, {
      global: {
        fetch: createCloudFetch(publishableKey),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) {
      throw new Error("Sesi login telah berakhir. Silakan masuk kembali.");
    }

    return next({
      context: { supabase, userId, claims: data.claims },
    });
  },
);