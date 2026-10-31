#!/usr/bin/env node
/**
 * Genera la ficha de perfil estilo "neofetch" en SVG, para los temas claro y oscuro.
 *
 * Entradas: config/profile.json, assets/ascii.txt y la API de GitHub.
 * Salidas:  dark_mode.svg, light_mode.svg (deterministas, sin timestamps).
 *
 * Uso:
 *   node scripts/build.mjs              # stats reales, requiere GITHUB_TOKEN
 *   node scripts/build.mjs --offline    # stats ficticios, sin red ni token
 *
 * Requisitos (sin dependencias de runtime):
 *   - Solo imports built-in de Node (fs, path, url, fetch).
 *   - package.json tiene "type": "module" y sin "dependencies".
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_FILE = join(ROOT, "config", "profile.json");
const ASCII_FILE = join(ROOT, "assets", "ascii.txt");

const THEMES = ["dark", "light"];

const THEME_DEFAULTS = {
  dark: {
    bg: "#0d1117",
    text: "#c9d1d9",
    key: "#ffa657",
    value: "#a5d6ff",
    dots: "#484f58",
    ascii: "#8b949e",
  },
  light: {
    bg: "#ffffff",
    text: "#24292f",
    key: "#bc4c00",
    value: "#0550ae",
    dots: "#afb8c1",
    ascii: "#57606a",
  },
};

const OFFLINE_STATS = {
  repos: 12,
  stars: 34,
  commits: 1240,
  followers: 7,
};

const escXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isBlank = (v) => v == null || String(v).trim() === "";

const containsCompletar = (v) => /completar/i.test(String(v));

function calcUptime(birthDateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDateStr).trim());
  if (!m) throw new Error("birthDate debe tener formato YYYY-MM-DD");
  const by = +m[1];
  const bm = +m[2];
  const bd = +m[3];
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) {
    throw new Error("birthDate invalido");
  }
  const today = new Date();
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();

  let years = ty - by;
  let months = tm - bm;
  let days = td - bd;

  if (days < 0) {
    months--;
    const prevMonthLastDay = new Date(ty, tm - 1, 0).getDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) throw new Error("birthDate esta en el futuro");

  const out = [];
  if (years > 0) out.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (months > 0) out.push(`${months} ${months === 1 ? "mes" : "meses"}`);
  if (days > 0) out.push(`${days} ${days === 1 ? "día" : "días"}`);
  return out.length > 0 ? out.join(", ") : "hoy";
}

async function githubFetch(url, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "federicobordon09-dev-profile",
    ...(init.headers || {}),
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error(`error de red/timeout: ${e.message}`);
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let txt = "";
    try {
      txt = await response.text();
    } catch {
      txt = "";
    }
    if (response.status === 403 || response.status === 429) {
      throw new Error(
        `rate limit / acceso denegado (HTTP ${response.status}): ${txt.slice(0, 200)}`
      );
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${txt.slice(0, 200)}`);
  }
  return response.json();
}

async function obtenerStatsReales(username) {
  const user = await githubFetch(`https://api.github.com/users/${username}`);

  let totalStars = 0;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const repos = await githubFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&type=owner&page=${page}`
    );
    if (!Array.isArray(repos) || repos.length === 0) {
      hasMore = false;
      continue;
    }
    for (const r of repos) totalStars += Number(r.stargazers_count ?? 0);
    if (repos.length < 100) hasMore = false;
    else page++;
  }

  let totalCommits = 0;
  if (user && user.created_at) {
    const firstYear = new Date(user.created_at).getUTCFullYear();
    const nowYear = new Date().getUTCFullYear();
    for (let y = firstYear; y <= nowYear; y++) {
      const from = `${y}-01-01T00:00:00Z`;
      const to =
        y === nowYear
          ? new Date().toISOString()
          : `${y}-12-31T23:59:59Z`;
      const query = `query($login: String!) { user(login: $login) { contributionsCollection(from: "${from}", to: "${to}") { totalCommitContributions } } }`;
      const gc = await githubFetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { login: username } }),
      });
      if (gc && Array.isArray(gc.errors) && gc.errors.length > 0) {
        throw new Error(`GraphQL: ${JSON.stringify(gc.errors).slice(0, 200)}`);
      }
      const n = gc?.data?.user?.contributionsCollection?.totalCommitContributions;
      totalCommits += Number(n ?? 0);
    }
  }

  return {
    repos: Number(user?.public_repos ?? 0),
    stars: totalStars,
    commits: totalCommits,
    followers: Number(user?.followers ?? 0),
  };
}

const OFFLINE = process.argv.includes("--offline");

async function main() {
  // 1. Leer config
  let profile;
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    profile = JSON.parse(raw);
  } catch (e) {
    console.error(`error: no se pudo leer ${CONFIG_FILE}: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  // 2. Validar campos requeridos
  const required = ["username", "displayName", "birthDate", "location", "stack", "theme"];
  for (const k of required) {
    if (!(k in profile) || isBlank(profile[k])) {
      console.error(`error: falta el campo requerido "${k}" en config/profile.json`);
      process.exitCode = 1;
      return;
    }
  }
  for (const theme of THEMES) {
    const themeObj = profile.theme?.[theme];
    if (!themeObj) {
      console.error(`error: tema "${theme}" ausente en profile.json.theme`);
      process.exitCode = 1;
      return;
    }
    for (const color of ["bg", "text", "key", "value", "dots", "ascii"]) {
      if (!(color in themeObj) || isBlank(themeObj[color])) {
        console.error(`error: falta theme.${theme}.${color} en profile.json`);
        process.exitCode = 1;
        return;
      }
    }
  }

  // 3. Leer ASCII
  let asciiLines;
  try {
    const raw = await readFile(ASCII_FILE, "utf8");
    asciiLines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
    while (asciiLines.length > 0 && asciiLines[asciiLines.length - 1] === "") {
      asciiLines.pop();
    }
    if (asciiLines.length === 0) {
      console.error("error: assets/ascii.txt esta vacio");
      process.exitCode = 1;
      return;
    }
  } catch (e) {
    console.error(`error: no se pudo leer ${ASCII_FILE}: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const asciiColumns = Math.max(...asciiLines.map((l) => l.length));
  asciiLines = asciiLines.map((l) => l.padEnd(asciiColumns, " "));

  // 4. Obtener stats
  let stats;
  if (OFFLINE) {
    stats = { ...OFFLINE_STATS };
    console.log("modo offline: usando stats ficticios");
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error("error: Falta GITHUB_TOKEN en el entorno (o usa --offline)");
      process.exitCode = 1;
      return;
    }
    try {
      stats = await obtenerStatsReales(profile.username);
    } catch (e) {
      console.error(`error: fallo al obtener stats de GitHub: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }

  // 5. Calcular uptime
  let uptimeStr;
  try {
    uptimeStr = calcUptime(profile.birthDate);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  // 6. Construir entradas (derecha)
  const entries = [];
  const addEntry = (key, value) => {
    if (isBlank(value)) return;
    const s = String(value).trim();
    if (containsCompletar(s)) {
      console.warn(`aviso: "${key}" contiene "COMPLETAR" (${JSON.stringify(s)}) — se omite del SVG`);
      return;
    }
    entries.push({ key, value: s });
  };

  addEntry("Uptime", uptimeStr);
  addEntry("Location", profile.location);
  addEntry("IDE", profile.ide);
  addEntry("Programming", profile.languages?.programming);
  addEntry("Real", profile.languages?.real);
  addEntry("Stack", profile.stack);
  addEntry("Software", profile.hobbies?.software);
  addEntry("Gaming", profile.hobbies?.gaming);
  addEntry("Portfolio", profile.contact?.portfolio);
  addEntry("LinkedIn", profile.contact?.linkedin);
  addEntry("npm", profile.contact?.npm);
  addEntry("Repos", String(stats.repos));
  addEntry("Stars", String(stats.stars));
  addEntry("Commits", String(stats.commits));
  addEntry("Followers", String(stats.followers));

  // 7. Constantes de layout
  const FONT = "ui-monospace, SFMono-Regular, Consolas, monospace";
  const FONT_SIZE = 14;
  const TITLE_FONT_SIZE = FONT_SIZE + 3;
  const LINE_HEIGHT = 20;
  const CHAR_WIDTH = 8.43;
  const PAD = 32;
  const GAP = 24;
  const TARGET_KEY_WIDTH = 40;

  const maxValLen = entries.reduce((m, e) => Math.max(m, e.value.length), 0);
  const displayName = String(profile.displayName);
  const detailChars = Math.max(TARGET_KEY_WIDTH + 1 + maxValLen, displayName.length);
  const detailColWidth = Math.round(detailChars * CHAR_WIDTH);

  const asciiColWidth = Math.round(asciiColumns * CHAR_WIDTH);

  const detailRows = 2 + entries.length; // title + rule + entries
  const detailHeight = detailRows * LINE_HEIGHT;
  const asciiHeight = asciiLines.length * LINE_HEIGHT;
  const contentHeight = Math.max(detailHeight, asciiHeight);

  const svgWidth = Math.round(PAD * 2 + asciiColWidth + GAP + detailColWidth);
  const svgHeight = Math.round(PAD * 2 + contentHeight);

  const dotsLine = ".".repeat(TARGET_KEY_WIDTH);

  function renderSvgForTheme(themeName) {
    const theme = { ...THEME_DEFAULTS[themeName], ...(profile.theme?.[themeName] || {}) };

    // ascii vertical offset (centrado respecto al bloque de detalles)
    const asciiTop = PAD + Math.max(0, Math.round((detailHeight - asciiHeight) / 2));

    const xAscii = PAD;
    const xDetails = Math.round(PAD + asciiColWidth + GAP);

    const baseline = (idx) => Math.round(PAD + FONT_SIZE + idx * LINE_HEIGHT);
    const asciiBaseline = (idx) => Math.round(asciiTop + FONT_SIZE + idx * LINE_HEIGHT);

    const asciiElements = asciiLines
      .map((line, idx) => {
        const escaped = escXml(line);
        return `  <text x="${xAscii}" y="${asciiBaseline(idx)}" fill="${theme.ascii}" xml:space="preserve">${escaped}</text>`;
      })
      .join("\n");

    const detailElements = [];

    // Titulo
    detailElements.push(
      `  <text x="${xDetails}" y="${baseline(0)}" fill="${theme.key}" font-size="${TITLE_FONT_SIZE}" font-weight="700" xml:space="preserve">${escXml(displayName)}</text>`
    );

    // Linea de puntos bajo el nombre
    detailElements.push(
      `  <text x="${xDetails}" y="${baseline(1)}" fill="${theme.dots}" xml:space="preserve">${dotsLine}</text>`
    );

    // Entradas
    entries.forEach((e, i) => {
      const key = escXml(e.key);
      const value = escXml(e.value);
      const dots = ".".repeat(Math.max(1, TARGET_KEY_WIDTH - e.key.length));
      const y = baseline(2 + i);
      detailElements.push(
        `  <text x="${xDetails}" y="${y}" xml:space="preserve"><tspan fill="${theme.key}">${key}</tspan><tspan fill="${theme.dots}">${dots}</tspan><tspan fill="${theme.value}"> ${value}</tspan></text>`
      );
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Ficha de perfil de Federico Bordón">
  <rect width="${svgWidth}" height="${svgHeight}" fill="${theme.bg}"/>
  <g font-family="${FONT}" font-size="${FONT_SIZE}" fill="${theme.text}">
${asciiElements}
${detailElements.join("\n")}
  </g>
</svg>`;

    return svg;
  }

  // 10. Escribir SVG para cada tema, solo si changed
  for (const theme of THEMES) {
    const svg = renderSvgForTheme(theme);

    let write = true;
    try {
      const existing = await readFile(join(ROOT, `${theme}_mode.svg`), "utf8");
      if (existing === svg) write = false;
    } catch {
      // archivo no existe
    }

    if (write) {
      await writeFile(join(ROOT, `${theme}_mode.svg`), svg, "utf8");
    }
  }

  console.log("build completado");
}

main().catch((e) => {
  console.error(`error fatal: ${e.message}`);
  process.exitCode = 1;
});
