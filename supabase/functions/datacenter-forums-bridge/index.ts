import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = "datacenter-forums";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const configuredProjectId = Deno.env.get("DATACENTER_FORUMS_PROJECT_ID")?.trim() || "";
    const configuredTokenHash = Deno.env.get("DATACENTER_FORUMS_TOKEN_SHA256")?.trim().toLowerCase() || "";
    if (!configuredProjectId || !configuredTokenHash) {
      return json({ error: "Bridge is not configured" }, 503);
    }

    const client = req.headers.get("x-perception-client")?.trim();
    const token = req.headers.get("x-perception-token")?.trim() || "";
    if (client !== CLIENT_ID || !token) return json({ error: "Unauthorized" }, 401);

    const tokenHash = await sha256Hex(token);
    if (tokenHash !== configuredTokenHash) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload) return json({ error: "Invalid JSON payload" }, 400);

    const eventId = typeof payload.event_id === "string" ? payload.event_id.trim().slice(0, 200) : "";
    const eventType = typeof payload.event_type === "string" ? payload.event_type.trim().slice(0, 80) : "";
    const subjectRef = typeof payload.subject_ref === "string" ? payload.subject_ref.trim().slice(0, 500) : "";
    const summary = typeof payload.summary === "string" ? payload.summary.trim().slice(0, 5000) : "";
    const observedAtRaw = typeof payload.observed_at === "string" ? payload.observed_at : "";
    const observedAt = observedAtRaw && !Number.isNaN(Date.parse(observedAtRaw))
      ? new Date(observedAtRaw).toISOString()
      : new Date().toISOString();
    const data = safeObject(payload.data);

    if (!eventId || !eventType || !subjectRef) {
      return json({ error: "event_id, event_type, and subject_ref are required" }, 400);
    }

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

    const sourceRef = typeof data.canonicalUrl === "string" ? data.canonicalUrl : null;
    const observationPayload = {
      subject_ref: subjectRef,
      ...data,
      integration: {
        client_id: CLIENT_ID,
        project_id: configuredProjectId,
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
    console.error(
      "DataCenter.Forums bridge failure",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Bridge failure" }, 500);
  }
});
