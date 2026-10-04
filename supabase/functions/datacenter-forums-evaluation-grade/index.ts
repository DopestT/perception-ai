import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  sendDataCenterEvaluationResult,
} from "../_shared/datacenter-forums-evaluation-feedback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const outcomes = new Set(["pass", "fail", "partial"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return json({ error: "Authentication required" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(
      Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}",
    ) as Record<string, string>;
    const secretKeys = JSON.parse(
      Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
    ) as Record<string, string>;
    const publishableKey = publishableKeys.default;
    const secretKey =
      secretKeys.default ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SECRET_KEY") ||
      "";

    if (!url || !publishableKey || !secretKey) {
      return json({ error: "Runtime unavailable" }, 503);
    }

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const body = asRecord(await req.json().catch(() => null));
    if (!body) return json({ error: "Invalid JSON payload" }, 400);

    const caseId = typeof body.case_id === "string" ? body.case_id.trim() : "";
    const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
    const score =
      body.score === undefined || body.score === null
        ? null
        : Number(body.score);
    const observedState =
      body.observed_state === undefined ? null : body.observed_state;
    const notes =
      body.notes === undefined || body.notes === null
        ? null
        : String(body.notes).slice(0, 5000);
    const graderSystem =
      typeof body.grader_system === "string" && body.grader_system.trim()
        ? body.grader_system.trim().slice(0, 120)
        : "perception-runtime";

    if (!/^[0-9a-f-]{36}$/i.test(caseId)) {
      return json({ error: "Invalid case_id" }, 400);
    }
    if (!outcomes.has(outcome)) {
      return json({ error: "Invalid outcome" }, 400);
    }
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 1)) {
      return json({ error: "Invalid score" }, 400);
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: benchmarkCase, error: caseError } = await admin
      .from("perception_external_evaluation_cases")
      .select("id,user_id,project_id,external_evaluation_id,eval_type,case_key,status")
      .eq("id", caseId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (caseError || !benchmarkCase) {
      return json({ error: "Evaluation case not found" }, 404);
    }

    const gradedAt = new Date().toISOString();
    const { error: gradeError } = await admin
      .from("perception_external_evaluation_cases")
      .update({
        outcome,
        score,
        observed_state: observedState,
        result_notes: notes,
        grader_system: graderSystem,
        graded_at: gradedAt,
        status: "graded",
        last_error: null,
        updated_at: gradedAt,
      })
      .eq("id", caseId)
      .eq("user_id", userData.user.id);

    if (gradeError) {
      console.error("DataCenter benchmark grade persistence failed", gradeError.message);
      return json({ error: "Unable to persist grade" }, 500);
    }

    try {
      const callback = await sendDataCenterEvaluationResult({
        evalType: benchmarkCase.eval_type,
        caseKey: benchmarkCase.case_key,
        outcome: outcome as "pass" | "fail" | "partial",
        score,
        observedState,
        notes,
        graderSystem,
      });

      const returnedAt = new Date().toISOString();
      await admin
        .from("perception_external_evaluation_cases")
        .update({
          status: "returned",
          returned_at: returnedAt,
          last_error: null,
          updated_at: returnedAt,
        })
        .eq("id", caseId)
        .eq("user_id", userData.user.id);

      return json({
        ok: true,
        case_id: caseId,
        external_evaluation_id: benchmarkCase.external_evaluation_id,
        outcome,
        score,
        callback,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "callback failed";
      await admin
        .from("perception_external_evaluation_cases")
        .update({
          status: "return_failed",
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId)
        .eq("user_id", userData.user.id);

      console.error("DataCenter benchmark callback failed", message);
      return json({
        error: "Grade saved, but DataCenter.Forums callback failed",
        retryable: true,
      }, 502);
    }
  } catch (error) {
    console.error(
      "DataCenter benchmark grade failure",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "Unexpected runtime failure" }, 500);
  }
});
