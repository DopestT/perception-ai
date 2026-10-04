import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  constantTimeHexEqual,
  prepareDataCenterEvent,
  sha256Hex,
} from "../_shared/datacenter-forums-bridge.ts";

const CLIENT_ID = "datacenter-forums";
const MAX_RAW_BODY_CHARS = 275_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const configuredProjectId = Deno.env.get("DATACENTER_FORUMS_PROJECT_ID")?.trim() || "";
    const configuredTokenHash = Deno.env.get("DATACENTER_FORUMS_TOKEN_SHA256")?.trim().toLowerCase() || "";

    if (!UUID_PATTERN.test(configuredProjectId) || !/^[0-9a-f]{64}$/.test(configuredTokenHash)) {
      return json({ error: "Bridge is not configured" }, 503);
    }

    const client = req.headers.get("x-perception-client")?.trim();
    const token = req.headers.get("x-perception-token")?.trim() || "";
    if (client !== CLIENT_ID || !token) return json({ error: "Unauthorized" }, 401);

    const tokenHash = await sha256Hex(token);
    if (!constantTimeHexEqual(tokenHash, configuredTokenHash)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const declaredLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RAW_BODY_CHARS) {
      return json({ error: "Payload too large" }, 413);
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_RAW_BODY_CHARS) {
      return json({ error: "Payload too large" }, 413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    const prepared = await prepareDataCenterEvent(payload, configuredProjectId);
    if (!prepared.ok) return json({ error: prepared.error }, prepared.status);
    const event = prepared.value;

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    const secretKey =
      secretKeys.default
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      || Deno.env.get("SUPABASE_SECRET_KEY")
      || "";

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
        trust_boundary: "external_observation_only",
      },
      p_observation_kind: event.eventType,
      p_external_version: event.eventId,
      p_content_hash: event.contentHash,
      p_summary: event.summary,
      p_payload: event.observationPayload,
      p_source_ref: event.sourceRef,
      p_observed_at: event.observedAt,
    });

    if (error) {
      console.error("DataCenter.Forums bridge ingestion failed", {
        code: error.code,
        message: error.message,
      });
      return json({ error: "Perception ingestion failed" }, 500);
    }

    return json({
      ok: true,
      project_id: configuredProjectId,
      event_id: event.eventId,
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
