/**
 * actor-assignment.ts
 * Algoritmo de Reparto Inteligente (N Personajes -> P Personas Físicas)
 *
 * Resuelve matemáticamente quién interpreta a qué personajes cuando hay menos actores
 * humanos que personajes en el libreto (P < C), optimizando una función de costo para:
 * 1. Prohibir/penalizar que una persona hable consigo misma en turnos consecutivos (diálogo directo).
 * 2. Evitar que coincidan en la misma escena.
 * 3. Equilibrar equitativamente la carga de palabras a leer entre los actores.
 * 4. Si hay conflicto inevitable (ej. 5 personajes en escena y solo 4 actores),
 *    asigna automáticamente el personaje en esa escena al sintetizador AI TTS.
 */

export interface CharacterStats {
  name: string;
  totalWords: number;
  scenes: Set<string | number>;
}

export interface PhysicalActorAssignment {
  actorIndex: number; // Persona física (1..P)
  actorName?: string;
  assignedCharacters: string[];
  totalWords: number;
  sceneCollisions: { sceneId: string | number; conflictingChars: [string, string] }[];
}

export interface CastAssignmentResult {
  humanAssignments: PhysicalActorAssignment[];
  aiTtsFallbackCharacters: { sceneId: string | number; character: string }[];
  summary: {
    totalCharacters: number;
    numHumans: number;
    unavoidableConflicts: number;
  };
}

// ─── Pesos de penalización de la función de costo ─────────────────────────────
const ALPHA_DIRECT_DIALOGUE = 10000; // Prohibido hablar consigo mismo en turnos seguidos
const BETA_SAME_SCENE = 500; // Evitar coincidir en la misma escena
const GAMMA_WORD_BALANCE = 1; // Equilibrar cantidad de texto a leer

/**
 * Asigna matemáticamente personajes a personas físicas minimizando conflictos escénicos.
 */
export function assignCharactersToHumans(
  characters: CharacterStats[],
  directDialogueMatrix: Record<string, Record<string, number>>, // Veces que A habla directo con B
  numPhysicalHumans: number,
): CastAssignmentResult {
  if (numPhysicalHumans < 1) {
    numPhysicalHumans = 1;
  }

  // 1. Ordenar los personajes de mayor a menor carga de palabras
  const sortedChars = [...characters].sort((a, b) => b.totalWords - a.totalWords);

  // 2. Inicializar las P personas físicas (ej. 4 actores humanos)
  const humans: PhysicalActorAssignment[] = Array.from({ length: numPhysicalHumans }, (_, i) => ({
    actorIndex: i + 1,
    actorName: i === 0 ? "Tú (Actor principal)" : `Actor ${i + 1}`,
    assignedCharacters: [],
    totalWords: 0,
    sceneCollisions: [],
  }));

  const aiTtsFallbackCharacters: { sceneId: string | number; character: string }[] = [];
  let unavoidableConflicts = 0;

  for (const char of sortedChars) {
    let bestActor: PhysicalActorAssignment | null = null;
    let lowestCost = Infinity;

    for (const human of humans) {
      let directCollisions = 0;
      let sharedScenesCount = 0;

      for (const existingCharName of human.assignedCharacters) {
        // ¿Hablan directamente entre sí en turnos consecutivos?
        directCollisions +=
          directDialogueMatrix[char.name]?.[existingCharName] ??
          directDialogueMatrix[existingCharName]?.[char.name] ??
          0;

        // ¿Aparecen en la misma escena?
        const existingChar = characters.find((c) => c.name === existingCharName);
        if (existingChar) {
          for (const sceneId of char.scenes) {
            if (existingChar.scenes.has(sceneId)) {
              sharedScenesCount++;
            }
          }
        }
      }

      const cost =
        directCollisions * ALPHA_DIRECT_DIALOGUE +
        sharedScenesCount * BETA_SAME_SCENE +
        human.totalWords * GAMMA_WORD_BALANCE;

      if (cost < lowestCost) {
        lowestCost = cost;
        bestActor = human;
      }
    }

    // Si incluso el mejor actor tiene colisión directa en escena (ej. 5 personajes hablan y hay 4 humanos)
    if (bestActor && lowestCost >= ALPHA_DIRECT_DIALOGUE) {
      unavoidableConflicts++;
      for (const existingCharName of bestActor.assignedCharacters) {
        const existingChar = characters.find((c) => c.name === existingCharName);
        if (existingChar) {
          for (const sceneId of char.scenes) {
            if (existingChar.scenes.has(sceneId)) {
              bestActor.sceneCollisions.push({
                sceneId,
                conflictingChars: [existingCharName, char.name],
              });
              aiTtsFallbackCharacters.push({ sceneId, character: char.name });
            }
          }
        }
      }
    }

    if (bestActor) {
      bestActor.assignedCharacters.push(char.name);
      bestActor.totalWords += char.totalWords;
    }
  }

  return {
    humanAssignments: humans,
    aiTtsFallbackCharacters,
    summary: {
      totalCharacters: characters.length,
      numHumans: numPhysicalHumans,
      unavoidableConflicts,
    },
  };
}

/**
 * Calcula en memoria la matriz de diálogos consecutivos (turnos) y las estadísticas
 * de cada personaje directamente a partir de las escenas y líneas parseadas.
 * Compatible 100% con IndexedDB sin requerir conexión a servidor PostgreSQL.
 */
export function computeConflictMatrixInMemory(
  scenes: Array<{
    id: string | number;
    lines: Array<{ characterName?: string | null; text: string }>;
  }>,
): {
  characterStats: CharacterStats[];
  directDialogueMatrix: Record<string, Record<string, number>>;
} {
  const directDialogueMatrix: Record<string, Record<string, number>> = {};
  const statsMap = new Map<string, { totalWords: number; scenes: Set<string | number> }>();

  const ensureEntry = (name: string) => {
    if (!directDialogueMatrix[name]) directDialogueMatrix[name] = {};
    if (!statsMap.has(name)) {
      statsMap.set(name, { totalWords: 0, scenes: new Set() });
    }
  };

  for (const scene of scenes) {
    let prevSpeaker: string | null = null;

    for (const line of scene.lines) {
      const speaker = line.characterName?.trim().toUpperCase();
      if (!speaker) continue;

      ensureEntry(speaker);
      const stat = statsMap.get(speaker)!;
      stat.scenes.add(scene.id);
      const wordCount = line.text.trim().split(/\s+/).filter(Boolean).length;
      stat.totalWords += wordCount;

      // Registrar intercambio de turno directo
      if (prevSpeaker && prevSpeaker !== speaker) {
        ensureEntry(prevSpeaker);
        directDialogueMatrix[prevSpeaker][speaker] =
          (directDialogueMatrix[prevSpeaker][speaker] || 0) + 1;
        directDialogueMatrix[speaker][prevSpeaker] =
          (directDialogueMatrix[speaker][prevSpeaker] || 0) + 1;
      }

      prevSpeaker = speaker;
    }
  }

  const characterStats: CharacterStats[] = Array.from(statsMap.entries()).map(([name, s]) => ({
    name,
    totalWords: s.totalWords,
    scenes: s.scenes,
  }));

  return { characterStats, directDialogueMatrix };
}
