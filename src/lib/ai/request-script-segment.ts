import { createServerFn } from "@tanstack/react-start";
import { runScriptSegment } from "@/lib/ai/segment-script";
import type { ScriptSegmentInput, ScriptSegmentResult } from "@/lib/ai/types";

function parseSegmentInput(data: unknown): ScriptSegmentInput {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawText = typeof row.rawText === "string" ? row.rawText : "";
  const title = typeof row.title === "string" ? row.title.trim().slice(0, 120) : undefined;
  return { rawText, title };
}

export const requestScriptSegment = createServerFn({ method: "POST" })
  .inputValidator((data: ScriptSegmentInput) => parseSegmentInput(data))
  .handler(async ({ data }): Promise<ScriptSegmentResult | null> => runScriptSegment(data));
