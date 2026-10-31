#!/usr/bin/env node
/**
 * Convierte assets/source/logo-f.png a assets/ascii.txt.
 *
 * - Si el PNG existe, lo convierte a arte ASCII (~60 columnas),
 *   usando una rampa de caracteres de claro a oscuro y respetando
 *   la proporcion de caracteres mas altos que anchos.
 * - Si no existe, genera una "<F>" grande en ASCII por texto.
 *
 * Herramienta manual: el workflow NO la ejecuta.
 *
 * Para el modo imagen hace falta pngjs como devDependency opcional:
 *   npm i -D pngjs
 * El build.mjs no depende de esa libreria.
 *
 * Uso: node scripts/ascii-from-image.mjs [--width N] [--threshold N] [--invert]
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_PNG = join(ROOT, "assets", "source", "logo-f.png");
const OUT_TXT = join(ROOT, "assets", "ascii.txt");

const DEFAULT_WIDTH = 60;
const DEFAULT_THRESHOLD = 128;
const RAMP = " .:-=+*#%@"; // de mas claro a mas oscuro
const ROW_ASPECT = 0.5; // un caracter monoespaciado tipicamente mide el doble de alto que ancho

const GLYPHS = {
  "<": ["   ##", "  ##", " ##", "##", " ##", "  ##", "   ##"],
  "F": ["######", "##", "##", "####", "##", "##", "##"],
  ">": ["##", "  ##", "   ##", "    ##", "   ##", "  ##", "##"],
};

function scaleGlyph(glyph, scaleX, scaleY) {
  const width = Math.max(...glyph.map((r) => r.length));
  const padded = glyph.map((r) => r.padEnd(width, " "));
  const scaled = [];
  for (const row of padded) {
    const scaledRow = row
      .split("")
      .map((c) => (c === "#" ? "#".repeat(scaleX) : " ".repeat(scaleX)))
      .join("");
    for (let i = 0; i < scaleY; i++) scaled.push(scaledRow);
  }
  return scaled;
}

function fallbackAscii(width = DEFAULT_WIDTH) {
  const chars = ["<", "F", ">"];
  const scaled = chars.map((c) => scaleGlyph(GLYPHS[c], 2, 2));
  const height = scaled[0].length;
  const gap = "    ";
  const lines = [];
  for (let i = 0; i < height; i++) {
    lines.push(scaled.map((g) => g[i]).join(gap));
  }
  return lines.map((l) => l.padEnd(width, " ")).join("\n");
}

async function pngToAsciiWithPngjs(width, threshold, invert) {
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

  const asciiHeight = Math.max(1, Math.round((imgHeight / imgWidth) * width * ROW_ASPECT));

  const asciiLines = [];
  for (let row = 0; row < asciiHeight; row++) {
    let line = "";
    const y = Math.round((row / asciiHeight) * imgHeight);
    for (let col = 0; col < width; col++) {
      const x = Math.round((col / width) * imgWidth);
      const pixel = image.data[(y * imgWidth + x) * 4];
      const inverted = invert ? pixel : 255 - pixel;
      const index = Math.min(RAMP.length - 1, Math.floor((inverted / 255) * (RAMP.length - 1)));
      line += RAMP[index];
    }
    asciiLines.push(line);
  }

  let minCol = width;
  let maxCol = -1;
  for (let row = 0; row < asciiLines.length; row++) {
    const line = asciiLines[row];
    for (let c = 0; c < width; c++) {
      if (line[c] !== " ") {
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }
    }
  }

  if (maxCol < minCol) {
    return fallbackAscii(width);
  }

  return asciiLines.map((line) => line.substring(minCol, maxCol + 1)).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  let width = DEFAULT_WIDTH;
  let threshold = DEFAULT_THRESHOLD;
  let invert = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--width" && args[i + 1] !== undefined) {
      width = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--threshold" && args[i + 1] !== undefined) {
      threshold = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--invert") {
      invert = true;
    }
  }

  let asciiContent;
  try {
    await stat(SOURCE_PNG);
    asciiContent = await pngToAsciiWithPngjs(width, threshold, invert);
    console.log(`ok: assets/ascii.txt convertido desde ${SOURCE_PNG} (${width} columnas)`);
  } catch (err) {
    if (err.code === "ENOENT") {
      asciiContent = fallbackAscii(width);
      console.log(`ok: assets/ascii.txt generado (<F> grande) - no hay ${SOURCE_PNG}`);
    } else {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  await writeFile(OUT_TXT, asciiContent, "utf8");
  console.log(`ok: escrito en ${OUT_TXT}`);
}

main().catch((err) => {
  console.error(`error fatal: ${err.message}`);
  process.exitCode = 1;
});
