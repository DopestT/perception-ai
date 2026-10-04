import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DATACENTER_TRANSPORT_LIMITS,
  isFreshUnixTimestamp,
  prepareDataCenterEvent,
  sha256Hex,
  verifyDataCenterSignature,
} from "../_shared/datacenter-forums-bridge.ts";
import {
  prepareDataCenterBenchmarkCase,
} from "../_shared/datacenter-forums-evaluation-feedback.ts";

const CLIENT_ID = "datacenter-forums";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const configuredProjectId = Deno.env.get("DATACENTER_FORUMS_PROJECT_ID")?.trim() || "";
    const hmacSecret = Deno.env.get("DATACENTER_FORUMS_HMAC_SECRET")?.trim() || "";

    if (!UUID_PATTERN.test(configuredProjectId) || hmacSecret.length < 32) {
      return json({ error: "Bridge is not configured" }, 503);
    }

    const contentType = req.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }

    const client = req.headers.get("x-perception-client")?.trim();
    const timestamp = req.headers.get("x-perception-timestamp")?.trim() || "";
    const signature = req.headers.get("x-perception-signature")?.trim() || "";

    if (client !== CLIENT_ID || !timestamp || !signature) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!isFreshUnixTimestamp(timestamp)) {
      return json({ error: "Expired or invalid request timestamp" }, 401);
    }

    const declaredLength = Number(req.headers.get("content-length") || "0");
    if (
      Number.isFinite(declaredLength)
      && declaredLength > DATACENTER_TRANSPORT_LIMITS.maxRawBodyBytes
    ) {
      return json({ error: "Payload too large" }, 413);
    }

    const rawBody = await req.text();
    if (encoder.encode(rawBody).byteLength > DATACENTER_TRANSPORT_LIMITS.maxRawBodyBytes) {
      return json({ error: "Payload too large" }, 413);
    }

    if (!await verifyDataCenterSignature(hmacSecret, timestamp, rawBody, signature)) {
      return json({ error: "Unauthorized" }, 401);
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
    const bodyHash = await sha256Hex(rawBody);

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

    const { data: insertedReceipt, error: receiptInsertError } = await admin
      .from("perception_bridge_receipts")
      .insert({
        client_id: CLIENT_ID,
        event_id: event.eventId,
        body_hash: bodyHash,
        status: "processing",
      })
      .select("id,body_hash,status,observation_id,updated_at")
      .maybeSingle();

    let receipt = insertedReceipt;

    if (receiptInsertError) {
      if (receiptInsertError.code !== "23505") {
        console.error("DataCenter.Forums receipt insert failed", receiptInsertError.message);
        return json({ error: "Bridge receipt unavailable" }, 503);
      }

      const { data: existingReceipt, error: receiptLookupError } = await admin
        .from("perception_bridge_receipts")
        .select("id,body_hash,status,observation_id,updated_at")
        .eq("client_id", CLIENT_ID)
        .eq("event_id", event.eventId)
        .maybeSingle();

      if (receiptLookupError || !existingReceipt) {
        console.error("DataCenter.Forums receipt lookup failed", receiptLookupError?.message);
        return json({ error: "Bridge receipt unavailable" }, 503);
      }

      if (existingReceipt.body_hash !== bodyHash) {
        return json({ error: "Event id already exists with different content" }, 409);
      }

      if (existingReceipt.status === "accepted") {
        return json({
          ok: true,
          duplicate: true,
          project_id: configuredProjectId,
          event_id: event.eventId,
          inserted: false,
          observation_id: existingReceipt.observation_id,
        });
      }

      const updatedAt = Date.parse(existingReceipt.updated_at);
      const processingIsFresh =
        existingReceipt.status === "processing"
        && Number.isFinite(updatedAt)
        && Date.now() - updatedAt < 60_000;

      if (processingIsFresh) {
        return json({ error: "Event is already being processed" }, 409);
      }

      const { data: reclaimedReceipt, error: reclaimError } = await admin
        .from("perception_bridge_receipts")
        .update({
          status: "processing",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingReceipt.id)
        .eq("updated_at", existingReceipt.updated_at)
        .select("id,body_hash,status,observation_id,updated_at")
        .maybeSingle();

      if (reclaimError || !reclaimedReceipt) {
        return json({ error: "Event is already being retried" }, 409);
      }

      receipt = reclaimedReceipt;
    }

    if (!receipt?.id) {
      return json({ error: "Bridge receipt unavailable" }, 503);
    }

    const failReceipt = async (message: string) => {
      await admin
        .from("perception_bridge_receipts")
        .update({
          status: "failed",
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", receipt.id);
    };

    const { data: project, error: projectError } = await admin
      .from("perception_projects")
      .select("id,user_id")
      .eq("id", configuredProjectId)
      .maybeSingle();

    if (projectError || !project?.user_id) {
      await failReceipt(projectError?.message || "Project World unavailable");
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
        transport_auth: "hmac-sha256-v1",
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
      await failReceipt(`${error.code ?? "unknown"}: ${error.message ?? "ingestion failed"}`);
      console.error("DataCenter.Forums bridge ingestion failed", {
        code: error.code,
        message: error.message,
      });
      return json({ error: "Perception ingestion failed" }, 500);
    }

    const observationId = result?.observation_id ?? null;

    if (event.eventType === "evaluation.requested") {
      if (!observationId) {
        await failReceipt("Benchmark observation id is unavailable");
        return json({ error: "Benchmark observation unavailable" }, 500);
      }

      const benchmark = prepareDataCenterBenchmarkCase(event.observationPayload);
      if (!benchmark.ok) {
        await failReceipt(benchmark.error);
        return json({ error: benchmark.error }, 400);
      }

      const { error: benchmarkInsertError } = await admin
        .from("perception_external_evaluation_cases")
        .upsert({
          user_id: project.user_id,
          project_id: configuredProjectId,
          source_observation_id: observationId,
          client_id: CLIENT_ID,
          external_evaluation_id: benchmark.value.externalEvaluationId,
          benchmark_hash: event.contentHash,
          eval_type: benchmark.value.evalType,
          case_key: benchmark.value.caseKey,
          subject_type: benchmark.value.subjectType,
          subject_key: benchmark.value.subjectKey,
          benchmark: benchmark.value.benchmark,
          status: "pending",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "source_observation_id",
          ignoreDuplicates: true,
        });

      if (benchmarkInsertError) {
        await failReceipt(benchmarkInsertError.message);
        console.error("DataCenter.Forums benchmark materialization failed", benchmarkInsertError.message);
        return json({ error: "Benchmark materialization failed" }, 500);
      }
    }

    const { error: finalizeError } = await admin
      .from("perception_bridge_receipts")
      .update({
        status: "accepted",
        observation_id: observationId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receipt.id);

    if (finalizeError) {
      console.error("DataCenter.Forums receipt finalize failed", finalizeError.message);
      return json({ error: "Bridge receipt finalization failed" }, 503);
    }

    return json({
      ok: true,
      duplicate: false,
      project_id: configuredProjectId,
      event_id: event.eventId,
      inserted: result?.inserted ?? null,
      observation_id: observationId,
    });
  } catch (error) {
    console.error(
      "DataCenter.Forums bridge failure",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Bridge failure" }, 500);
  }
});
