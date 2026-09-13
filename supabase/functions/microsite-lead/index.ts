import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_DOMAIN = "hagerstownbasementwaterproofing.com";
const allowedOrigins = new Set([
  `https://${SITE_DOMAIN}`,
  `https://www.${SITE_DOMAIN}`,
]);

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : `https://${SITE_DOMAIN}`;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function validEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string | null) {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function validZip(value: string | null) {
  return !!value && /^\d{5}(?:-\d{4})?$/.test(value);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return await req.json();
  const form = await req.formData();
  return Object.fromEntries(form.entries());
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { ok: false, error: "method_not_allowed" }, 405);
  if (!origin || !allowedOrigins.has(origin)) return json(origin, { ok: false, error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await parseBody(req);
  } catch {
    return json(origin, { ok: false, error: "bad_request" }, 400);
  }

  // Honeypot: bots that fill this invisible field receive a neutral success response.
  if (clean(body.website, 200)) return json(origin, { ok: true });

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 160);
  const zip = clean(body.zip, 10);
  const issue = clean(body.issue, 1500);
  const sourcePath = clean(body.source_path, 240) || "/";
  const siteDomain = clean(body.site_domain, 180) || SITE_DOMAIN;

  if (siteDomain !== SITE_DOMAIN || !name || !validPhone(phone) || !validEmail(email) || !validZip(zip) || !issue) {
    return json(origin, { ok: false, error: "invalid_submission" }, 400);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) return json(origin, { ok: false, error: "unavailable" }, 503);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: microsite, error: siteError } = await supabase
    .from("perception_microsites")
    .select("id,user_id,status")
    .eq("domain", SITE_DOMAIN)
    .maybeSingle();

  if (siteError || !microsite || microsite.status === "paused") {
    console.error("microsite_lookup_failed", siteError?.code || "not_found");
    return json(origin, { ok: false, error: "unavailable" }, 503);
  }

  const rawIp = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const networkHash = await sha256(`${serviceKey.slice(0, 24)}:${SITE_DOMAIN}:${rawIp}`);
  const now = new Date();
  const hourBucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())).toISOString();

  const { data: rateRow } = await supabase
    .from("perception_microsite_lead_rate_limits")
    .select("submission_count")
    .eq("microsite_id", microsite.id)
    .eq("network_hash", networkHash)
    .eq("hour_bucket", hourBucket)
    .maybeSingle();

  const count = Number(rateRow?.submission_count || 0);
  if (count >= 5) return json(origin, { ok: false, error: "rate_limited" }, 429);

  await supabase.from("perception_microsite_lead_rate_limits").upsert({
    microsite_id: microsite.id,
    network_hash: networkHash,
    hour_bucket: hourBucket,
    submission_count: count + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "microsite_id,network_hash,hour_bucket" });

  const { error: insertError } = await supabase.from("perception_microsite_leads").insert({
    user_id: microsite.user_id,
    microsite_id: microsite.id,
    channel: "FORM",
    source_path: sourcePath,
    metadata: {
      name,
      phone,
      email,
      zip,
      issue,
      consent_version: "2026-09-13-v1",
      site_domain: SITE_DOMAIN,
    },
  });

  if (insertError) {
    console.error("microsite_lead_insert_failed", insertError.code);
    return json(origin, { ok: false, error: "unavailable" }, 503);
  }

  return json(origin, { ok: true });
});
