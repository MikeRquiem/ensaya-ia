import type { ScriptLineWithCharacter } from "@/lib/rehearsal-data";

/**
 * Junta turnos consecutivos del mismo personaje en la misma escena cuando no hay
 * acotación intermedia, para ensayar parlamentos largos de corrido.
 */
export function consolidateScriptLines(
  lines: ScriptLineWithCharacter[],
): ScriptLineWithCharacter[] {
  if (!lines || lines.length <= 1) return lines || [];

  const consolidated: ScriptLineWithCharacter[] = [];
  for (const line of lines) {
    const last = consolidated[consolidated.length - 1];
    const sameSpeaker =
      last &&
      last.character_id === line.character_id &&
      last.scene_id === line.scene_id &&
      !line.cue;

    if (sameSpeaker) {
      const sep = last.text.endsWith("-") ? "" : " ";
      last.text = `${last.text.trim()}${sep}${line.text.trim()}`;
      last.duration_seconds = (last.duration_seconds || 3) + (line.duration_seconds || 3);
    } else {
      consolidated.push({ ...line });
    }
  }

  consolidated.forEach((line, idx) => {
    line.line_order = idx + 1;
  });

  return consolidated;
}
