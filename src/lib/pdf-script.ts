/**
 * Extracción geométrica de PDFs para libretos teatrales y cinematográficos.
 *
 * Usa coordenadas (X, Y) vía pdfjs-dist (en extractGeometricLines) para
 * reconstruir renglones y detectar páginas a dos columnas, en lugar de aplanar
 * todo el contenido de cada página en un solo renglón.
 */

import { extractGeometricLines } from "@/lib/ai/script-parser";

export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const lines = await extractGeometricLines(data);

  if (lines.length === 0) {
    throw new Error(
      "El PDF no contiene texto digital extraíble. Asegúrate de que no sea un escaneo o imagen.",
    );
  }

  return lines.map((l) => l.text).join("\n");
}

export async function readScriptFile(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(file);
  }
  return file.text();
}
