import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = "datacenter-forums";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const encoder = new TextEncoder();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifySignature(secret: string, timestamp: string, rawBody: string, signatureHeader: string) {
  const signatureHex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedString(value: unknown, field: string, maxLength: number, required = false) {
  if (typeof value !== "string") {
    if (required) throw new Error(`${field} is required`);
    return "";
  }
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${field} is required`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
  return normalized;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const configuredProjectId = Deno.env.get("DATACENTER_FORUMS_PROJECT_ID")?.trim() || "";
    const hmacSecret = Deno.env.get("DATACENTER_FORUMS_HMAC_SECRET")?.trim() || "";
    if (!configuredProjectId || !hmacSecret) {
      return json({ error: "Bridge is not configured" }, 503);
    }

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    const client = req.headers.get("x-perception-client")?.trim();
    const timestamp = req.headers.get("x-perception-timestamp")?.trim() || "";
    const signature = req.headers.get("x-perception-signature")?.trim() || "";
    if (client !== CLIENT_ID || !timestamp || !signature) {
      return json({ error: "Unauthorized" }, 401);
    }

    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS
    ) {
      return json({ error: "Expired or invalid request timestamp" }, 401);
    }

    const rawBody = await req.text();
    if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    if (!await verifySignature(hmacSecret, timestamp, rawBody, signature)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const eventId = boundedString(payload.event_id, "event_id", 200, true);
    const eventType = boundedString(payload.event_type, "event_type", 80, true);
    const subjectRef = boundedString(payload.subject_ref, "subject_ref", 500, true);
    const summary = boundedString(payload.summary, "summary", 5000, false);

    if (!/^[a-z0-9._:-]+$/i.test(eventId)) {
      return json({ error: "Invalid event_id" }, 400);
    }
    if (!/^[a-z0-9._:-]+$/i.test(eventType)) {
      return json({ error: "Invalid event_type" }, 400);
    }

    const observedAtRaw = boundedString(payload.observed_at, "observed_at", 64, false);
    if (observedAtRaw && Number.isNaN(Date.parse(observedAtRaw))) {
      return json({ error: "Invalid observed_at" }, 400);
    }
    const observedAt = observedAtRaw
      ? new Date(observedAtRaw).toISOString()
      : new Date().toISOString();

    if (new Date(observedAt).getTime() > Date.now() + MAX_CLOCK_SKEW_SECONDS * 1000) {
      return json({ error: "observed_at is too far in the future" }, 400);
    }

    const data = safeObject(payload.data);

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const secretKey = secretKeys.default;
    if (!url || !secretKey) return json({ error: "Runtime unavailable" }, 503);

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: project, error: projectError } = await admin
      .from("perception_projects")
      .select("id,user_id")
      .eq("id", configuredProjectId)
      .maybeSingle();

    if (projectError || !project?.user_id) {
      console.error("DataCenter.Forums bridge project lookup failed", projectError?.message);
      return json({ error: "Perception project unavailable" }, 503);
    }

    const sourceRef = typeof data.canonicalUrl === "string" && /^https?:\/\//i.test(data.canonicalUrl)
      ? data.canonicalUrl.slice(0, 2000)
      : null;

    const observationPayload = {
      subject_ref: subjectRef,
      ...data,
      integration: {
        client_id: CLIENT_ID,
        project_id: configuredProjectId,
        transport_auth: "hmac-sha256-v1",
        request_timestamp: timestampSeconds,
        trust_boundary: "external_observation_only",
        authoritative_truth_requires_perception_verification: true,
      },
    };

    const contentHash = await sha256Hex(stableStringify({
      eventId,
      eventType,
      subjectRef,
      summary,
      observedAt,
      data: observationPayload,
    }));

    const { data: result, error } = await admin.rpc("perception_ingest_project_observation_internal", {
      p_user_id: project.user_id,
      p_project_id: configuredProjectId,
      p_provider: "datacenter_forums",
      p_source_type: "api",
      p_external_id: "datacenter-forums-intelligence-stream-v1",
      p_label: "DataCenter.Forums verified infrastructure intelligence stream",
      p_locator: null,
      p_sync_mode: "push",
      p_source_metadata: {
        system: "DataCenter.Forums",
        domain: "data_center_infrastructure",
        purpose: "continuous_real_world_perception_training_and_verification",
        transport_auth: "hmac-sha256-v1",
      },
      p_observation_kind: eventType,
      p_external_version: eventId,
      p_content_hash: contentHash,
      p_summary: summary,
      p_payload: observationPayload,
      p_source_ref: sourceRef,
      p_observed_at: observedAt,
    });

    if (error) {
      console.error("DataCenter.Forums bridge ingestion failed", { code: error.code, message: error.message });
      return json({ error: "Perception ingestion failed" }, 500);
    }

    return json({
      ok: true,
      project_id: configuredProjectId,
      event_id: eventId,
      inserted: result?.inserted ?? null,
      observation_id: result?.observation_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (
      message.includes("is required") ||
      message.includes("exceeds")
    ) {
      return json({ error: message }, 400);
    }
    console.error("DataCenter.Forums bridge failure", message);
    return json({ error: "Bridge failure" }, 500);
  }
});
