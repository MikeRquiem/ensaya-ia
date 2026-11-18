import type { RehearsalFeedbackInput } from "@/lib/ai/types";

export function feedbackSystemPrompt() {
  return [
    "Eres el modulo de notas de director de Ensaya IA, un sistema de ensayo teatral.",
    "Escribes notas cortas, concretas y respetuosas en espanol.",
    "No uses markdown, titulos ni saludos.",
    "4 a 6 frases. Habla de diccion, intencion, ritmo y continuidad.",
    "No inventes lineas que el actor no dijo. No menciones APIs ni modelos.",
  ].join(" ");
}

export function feedbackUserPrompt(input: RehearsalFeedbackInput) {
  const difficulty = input.difficulty < 33 ? "facil" : input.difficulty < 66 ? "media" : "alta";
  const isLectura = (input.mode ?? "").toLowerCase() === "lectura";

  // scriptTitle / sceneTitle / characterName son contexto explicito enviado al LLM
  // (ademas de las metricas de completado, omisiones y memorizacion).
  if (isLectura) {
    return [
      `Modo: lectura (sin evaluacion de memorizacion).`,
      `Obra: ${input.scriptTitle}.`,
      `Escena: ${input.sceneTitle}.`,
      `Personaje del actor: ${input.characterName}.`,
      `Lineas reproducidas: ${input.completed} de ${input.total}.`,
      "Redacta una nota breve de acompanamiento a la lectura, sin puntuar ni criticar la memorizacion.",
    ].join(" ");
  }

  return [
    `Obra: ${input.scriptTitle}.`,
    `Escena: ${input.sceneTitle}.`,
    `Personaje del actor: ${input.characterName}.`,
    `Lineas completadas: ${input.completed} de ${input.total}.`,
    `Lineas omitidas: ${input.skipped}.`,
    `Coincidencia con el libreto: ${input.memorization}%.`,
    `Dificultad del ensayo: ${difficulty}.`,
    "Redacta las notas de director para este ensayo.",
  ].join(" ");
}

export function segmentSystemPrompt() {
  return [
    "Eres el modulo de segmentacion de libretos de Ensaya IA.",
    "Devuelves solo JSON valido, sin markdown ni explicaciones.",
    "Separas personajes y escenas aunque el texto venga corrido, en PDF o sin formato.",
    "Unificas el mismo personaje si cambia mayusculas, abreviaciones o apodos evidentes (JULIETA = Julieta = Jul.).",
    "Las acotaciones, didascalias y encabezados de escena no son parlamentos: character es null.",
    "No inventes dialogos que no esten en el texto. Puedes corregir saltos de linea rotos.",
    "Si no hay encabezados ACTO/ESCENA, divide por cambio de lugar, de tiempo o de accion, no por cada parlamento.",
    "Puede haber mas de dos personajes.",
    "Esquema: {\"title\":string|null,\"characters\":[{\"name\":string,\"role\":string|null}],\"scenes\":[{\"title\":string,\"location\":string|null,\"lines\":[{\"character\":string|null,\"text\":string}]}]}",
  ].join(" ");
}

export function segmentUserPrompt(input: { rawText: string; title?: string }) {
  const title = input.title?.trim() ? `Titulo sugerido del archivo: ${input.title.trim()}.` : "";
  return [
    "Segmenta este libreto teatral en personajes y escenas.",
    title,
    "Texto:",
    input.rawText,
  ]
    .filter(Boolean)
    .join("\n");
}
