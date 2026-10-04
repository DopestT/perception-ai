import {
  hmacSha256Hex,
  stableStringify,
} from "./datacenter-forums-bridge.ts";

export type DataCenterBenchmarkCase = {
  externalEvaluationId: string;
  evalType:
    | "change_detection"
    | "contradiction_detection"
    | "entity_resolution"
    | "source_routing"
    | "verification";
  caseKey: string;
  subjectType: string | null;
  subjectKey: string | null;
  benchmark: Record<string, unknown>;
};

export type BenchmarkPrepareResult =
  | { ok: true; value: DataCenterBenchmarkCase }
  | { ok: false; error: string };

const evalTypes = new Set<DataCenterBenchmarkCase["evalType"]>([
  "change_detection",
  "contradiction_detection",
  "entity_resolution",
  "source_routing",
  "verification",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function prepareDataCenterBenchmarkCase(
  observationPayload: Record<string, unknown>,
): BenchmarkPrepareResult {
  const benchmark = asRecord(observationPayload.benchmark);
  if (!benchmark) return { ok: false, error: "benchmark is required" };

  const externalEvaluationId =
    typeof benchmark.evaluationId === "string" ? benchmark.evaluationId.trim() : "";
  const evalType =
    typeof benchmark.evalType === "string" ? benchmark.evalType.trim() : "";
  const caseKey =
    typeof benchmark.caseKey === "string" ? benchmark.caseKey.trim() : "";

  if (!externalEvaluationId || externalEvaluationId.length > 200) {
    return { ok: false, error: "Invalid external evaluation id" };
  }
  if (!evalTypes.has(evalType as DataCenterBenchmarkCase["evalType"])) {
    return { ok: false, error: "Invalid evaluation type" };
  }
  if (!caseKey || caseKey.length > 500) {
    return { ok: false, error: "Invalid case key" };
  }

  const subjectType =
    typeof benchmark.subjectType === "string" && benchmark.subjectType.trim()
      ? benchmark.subjectType.trim().slice(0, 160)
      : null;
  const subjectKey =
    typeof benchmark.subjectKey === "string" && benchmark.subjectKey.trim()
      ? benchmark.subjectKey.trim().slice(0, 500)
      : null;

  return {
    ok: true,
    value: {
      externalEvaluationId,
      evalType: evalType as DataCenterBenchmarkCase["evalType"],
      caseKey,
      subjectType,
      subjectKey,
      benchmark,
    },
  };
}

export type DataCenterEvaluationResult = {
  evalType: DataCenterBenchmarkCase["evalType"];
  caseKey: string;
  outcome: "pass" | "fail" | "partial";
  score?: number | null;
  observedState?: unknown;
  notes?: string | null;
  graderSystem?: string;
};

export async function buildSignedEvaluationResultRequest(
  input: DataCenterEvaluationResult,
  secret: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  if (secret.length < 32) throw new Error("Result HMAC secret is too short");

  const body = stableStringify({
    eval_type: input.evalType,
    case_key: input.caseKey,
    outcome: input.outcome,
    score: input.score ?? null,
    observed_state: input.observedState ?? null,
    notes: input.notes ?? null,
    grader_system: input.graderSystem ?? "perception-runtime",
  });

  const signature = await hmacSha256Hex(secret, `${timestamp}.${body}`);

  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-perception-client": "perception-runtime",
      "x-perception-timestamp": timestamp,
      "x-perception-signature": `sha256=${signature}`,
    },
  };
}

export async function sendDataCenterEvaluationResult(
  input: DataCenterEvaluationResult,
  config: { url: string; secret: string },
) {
  const url = config.url.trim();
  const secret = config.secret.trim();

  if (!url || secret.length < 32) {
    throw new Error("DataCenter.Forums evaluation result callback is not configured");
  }

  const signed = await buildSignedEvaluationResultRequest(input, secret);
  const response = await fetch(url, {
    method: "POST",
    headers: signed.headers,
    body: signed.body,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DataCenter.Forums callback HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }

  return responseText ? JSON.parse(responseText) : { ok: true };
}
