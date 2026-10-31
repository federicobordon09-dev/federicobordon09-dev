#!/usr/bin/env node
/**
 * Convierte assets/source/logo-f.png a assets/ascii.txt.
 *
 * - Si el PNG existe, lo convierte a arte ASCII (ancho configurable),
 *   usando un unico caracter de relleno y recortando margenes vacios.
 * - Si no existe, avisa y NO genera fallback.
 *
 * Herramienta manual: el workflow NO la ejecuta.
 *
 * Dependencia dev: pngjs (npm i -D pngjs). build.mjs no depende de ella.
 *
 * Uso: node scripts/ascii-from-image.mjs [--width N] [--threshold N] [--char C] [--aspect N] [--invert]
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_PNG = join(ROOT, "assets", "source", "logo-f.png");
const OUT_TXT = join(ROOT, "assets", "ascii.txt");

const DEFAULT_WIDTH = 100;
const DEFAULT_THRESHOLD = 140;
const DEFAULT_CHAR = "#";
const DEFAULT_ASPECT = 0.4215; // = CHAR_WIDTH / LINE_HEIGHT del SVG (8.43 / 20)

async function pngToAscii(width, threshold, fillChar, aspect, invert) {
  let PNG;
  try {
    const pngjs = await import("pngjs");
    PNG = pngjs.PNG;
  } catch {
    throw new Error("No se pudo importar pngjs. Instalala como devDependency: npm i -D pngjs");
  }

  const data = await readFile(SOURCE_PNG);
  const image = PNG.sync.read(data);
  const imgWidth = image.width;
  const imgHeight = image.height;

  const asciiHeight = Math.max(1, Math.round((imgHeight / imgWidth) * width * aspect));

  // Construir grilla completa
  const grid = [];
  for (let row = 0; row < asciiHeight; row++) {
    let line = "";
    const y = Math.round((row / asciiHeight) * imgHeight);
    for (let col = 0; col < width; col++) {
      const x = Math.round((col / width) * imgWidth);
      const pixel = image.data[(y * imgWidth + x) * 4];
      const brightness = invert ? pixel : 255 - pixel;
      line += brightness >= threshold ? fillChar : " ";
    }
    grid.push(line);
  }

  // Recortar filas vacias arriba y abajo
  let top = 0, bottom = grid.length - 1;
  while (top <= bottom && grid[top].trim() === "") top++;
  while (bottom >= top && grid[bottom].trim() === "") bottom--;
  if (top > bottom) return "";
  const trimmedRows = grid.slice(top, bottom + 1);

  // Recortar columnas vacias izquierda y derecha
  let left = width, right = -1;
  for (const line of trimmedRows) {
    for (let c = 0; c < width; c++) {
      if (line[c] !== " ") {
        if (c < left) left = c;
        if (c > right) right = c;
      }
    }
  }
  if (right < left) return "";

  return trimmedRows.map((line) => line.substring(left, right + 1)).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  let width = DEFAULT_WIDTH;
  let threshold = DEFAULT_THRESHOLD;
  let fillChar = DEFAULT_CHAR;
  let aspect = DEFAULT_ASPECT;
  let invert = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--width" && args[i + 1] !== undefined) { width = parseInt(args[i + 1], 10); i++; }
    else if (args[i] === "--threshold" && args[i + 1] !== undefined) { threshold = parseInt(args[i + 1], 10); i++; }
    else if (args[i] === "--char" && args[i + 1] !== undefined) { fillChar = args[i + 1]; i++; }
    else if (args[i] === "--aspect" && args[i + 1] !== undefined) { aspect = parseFloat(args[i + 1]); i++; }
    else if (args[i] === "--invert") { invert = true; }
    else if (args[i] === "--no-invert") { invert = false; }
  }

  console.log(`aspect usado: ${aspect}`);
  if (aspect !== DEFAULT_ASPECT) {
    console.warn(`aviso: aspect (${aspect}) difiere del default del SVG (${DEFAULT_ASPECT}); puede desalinear columnas`);

  let asciiContent;
  try {
    await stat(SOURCE_PNG);
    asciiContent = await pngToAscii(width, threshold, fillChar, aspect, invert);
    console.log(`ok: assets/ascii.txt convertido desde ${SOURCE_PNG}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`aviso: no existe ${SOURCE_PNG}. No se genera fallback en silencio.`);
      console.warn("       Agrega el PNG y vuelve a correr: npm run ascii");
      process.exitCode = 0;
      return;
    } else {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!asciiContent || asciiContent.trim() === "") {
    console.error("error: la conversion produjo salida vacia");
    process.exitCode = 1;
    return;
  }

  const lines = asciiContent.split("\n");
  const cols = Math.max(...lines.map((l) => l.length));
  console.log(`tamaño final: ${lines.length} filas x ${cols} columnas`);
  console.log("vista previa:");
  console.log(asciiContent);

  await writeFile(OUT_TXT, asciiContent, "utf8");
  console.log(`ok: escrito en ${OUT_TXT}`);
}

main().catch((err) => { console.error(`error fatal: ${err.message}`); process.exitCode = 1; });