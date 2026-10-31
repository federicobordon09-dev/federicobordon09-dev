#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_FILE = join(ROOT, "config", "profile.json");
const ASCII_FILE = join(ROOT, "assets", "ascii.txt");

const THEMES = ["dark", "light"];

const THEME_DEFAULTS = {
  dark: { bg: "#0d1117", text: "#c9d1d9", key: "#ffa657", value: "#a5d6ff", dots: "#484f58", ascii: "#8b949e" },
  light: { bg: "#ffffff", text: "#24292f", key: "#bc4c00", value: "#0550ae", dots: "#afb8c1", ascii: "#57606a" },
};

const OFFLINE_STATS = { repos: 12, stars: 34, commits: 1240, followers: 7 };

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
  const by = +m[1], bm = +m[2], bd = +m[3];
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) throw new Error("birthDate invalido");
  const today = new Date();
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  let years = ty - by, months = tm - bm, days = td - bd;
  if (days < 0) { months--; days += new Date(ty, tm - 1, 0).getDate(); }
  if (months < 0) { years--; months += 12; }
  if (years < 0) throw new Error("birthDate esta en el futuro");
  const out = [];
  if (years > 0) out.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (months > 0) out.push(`${months} ${months === 1 ? "mes" : "meses"}`);
  if (days > 0) out.push(`${days} ${days === 1 ? "día" : "días"}`);
  return out.length > 0 ? out.join(", ") : "hoy";
}

async function githubFetch(url, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", "user-agent": "federicobordon09-dev-profile", ...(init.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response;
  try { response = await fetch(url, { ...init, headers, signal: controller.signal }); }
  catch (e) { clearTimeout(timeoutId); throw new Error(`error de red/timeout: ${e.message}`); }
  clearTimeout(timeoutId);
  if (!response.ok) {
    let txt = ""; try { txt = await response.text(); } catch {}
    if (response.status === 403 || response.status === 429) throw new Error(`rate limit / acceso denegado (HTTP ${response.status}): ${txt.slice(0, 200)}`);
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${txt.slice(0, 200)}`);
  }
  return response.json();
}

async function obtenerStatsReales(username) {
  const user = await githubFetch(`https://api.github.com/users/${username}`);
  let totalStars = 0, page = 1, hasMore = true;
  while (hasMore) {
    const repos = await githubFetch(`https://api.github.com/users/${username}/repos?per_page=100&type=owner&page=${page}`);
    if (!Array.isArray(repos) || repos.length === 0) { hasMore = false; continue; }
    for (const r of repos) totalStars += Number(r.stargazers_count ?? 0);
    if (repos.length < 100) hasMore = false; else page++;
  }
  let totalCommits = 0;
  if (user && user.created_at) {
    const firstYear = new Date(user.created_at).getUTCFullYear();
    const nowYear = new Date().getUTCFullYear();
    for (let y = firstYear; y <= nowYear; y++) {
      const from = `${y}-01-01T00:00:00Z`;
      const to = y === nowYear ? new Date().toISOString() : `${y}-12-31T23:59:59Z`;
      const query = `query($login: String!) { user(login: $login) { contributionsCollection(from: "${from}", to: "${to}") { totalCommitContributions } } }`;
      const gc = await githubFetch("https://api.github.com/graphql", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { login: username } }),
      });
      if (gc && Array.isArray(gc.errors) && gc.errors.length > 0) throw new Error(`GraphQL: ${JSON.stringify(gc.errors).slice(0, 200)}`);
      totalCommits += Number(gc?.data?.user?.contributionsCollection?.totalCommitContributions ?? 0);
    }
  }
  return { repos: Number(user?.public_repos ?? 0), stars: totalStars, commits: totalCommits, followers: Number(user?.followers ?? 0) };
}

const OFFLINE = process.argv.includes("--offline");

async function main() {
  let profile;
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    profile = JSON.parse(raw);
  } catch (e) {
    console.error(`error: no se pudo leer ${CONFIG_FILE}: ${e.message}`);
    process.exitCode = 1; return;
  }

  const required = ["username", "displayName", "birthDate", "location", "stack", "theme"];
  for (const k of required) {
    if (!(k in profile) || isBlank(profile[k])) {
      console.error(`error: falta el campo requerido "${k}" en config/profile.json`);
      process.exitCode = 1; return;
    }
  }
  for (const theme of THEMES) {
    const themeObj = profile.theme?.[theme];
    if (!themeObj) { console.error(`error: tema "${theme}" ausente`); process.exitCode = 1; return; }
    for (const color of ["bg", "text", "key", "value", "dots", "ascii"]) {
      if (!(color in themeObj) || isBlank(themeObj[color])) {
        console.error(`error: falta theme.${theme}.${color}`); process.exitCode = 1; return;
      }
    }
  }

  let asciiLines;
  try {
    const raw = await readFile(ASCII_FILE, "utf8");
    asciiLines = raw.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
    while (asciiLines.length > 0 && asciiLines[asciiLines.length - 1] === "") asciiLines.pop();
    if (asciiLines.length === 0) { console.error("error: assets/ascii.txt esta vacio"); process.exitCode = 1; return; }
  } catch (e) {
    console.error(`error: no se pudo leer ${ASCII_FILE}: ${e.message}`);
    process.exitCode = 1; return;
  }
  // Padding uniforme
  const asciiColumns = Math.max(...asciiLines.map((l) => l.length));
  asciiLines = asciiLines.map((l) => l.padEnd(asciiColumns, " "));

  // Recortar a la caja real (ignorar espacios sobrantes izq/der)
  let minLeft = Infinity, maxRight = 0;
  for (const line of asciiLines) {
    const left = line.length - line.trimStart().length;
    const right = line.trimEnd().length;
    if (left < minLeft) minLeft = left;
    if (right > maxRight) maxRight = right;
  }
  if (!isFinite(minLeft)) minLeft = 0;
  const trimmedWidth = Math.max(0, maxRight - minLeft);
  const asciiTrimmed = asciiLines.map((l) => l.substring(minLeft, maxRight).padEnd(trimmedWidth, " "));

  const OUT_DIR = OFFLINE ? join(ROOT, ".preview") : ROOT;
  if (OFFLINE) {
    await mkdir(OUT_DIR, { recursive: true });
    console.log("modo offline: usando stats ficticios");
    console.log("aviso: modo offline — los SVG se escriben en .preview/ (los SVG del repo no se modifican)");
  }

  let stats;
  if (OFFLINE) {
    stats = { ...OFFLINE_STATS };
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!token) { console.error("error: Falta GITHUB_TOKEN en el entorno (o usa --offline)"); process.exitCode = 1; return; }
    try { stats = await obtenerStatsReales(profile.username); }
    catch (e) { console.error(`error: fallo al obtener stats de GitHub: ${e.message}`); process.exitCode = 1; return; }
  }

  let uptimeStr;
  try { uptimeStr = calcUptime(profile.birthDate); }
  catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; return; }

  // Construir items del panel derecho
  const detailItems = [];
  const warnCompletar = (key, val) => console.warn(`aviso: "${key}" contiene "COMPLETAR" (${JSON.stringify(val)}) — se omite del SVG`);

  const pushEntry = (key, value) => {
    if (isBlank(value)) return;
    let s = String(value).trim();
    if (key === "LinkedIn" && /^https?:\/\//i.test(s)) {
      const idx = s.indexOf("in/");
      if (idx !== -1) s = s.slice(idx);
    }
    if (containsCompletar(s)) { warnCompletar(key, s); return; }
    detailItems.push({ type: "entry", key, value: s });
  };

  const pushSection = (name, fn) => {
    const before = detailItems.length;
    fn();
    const added = detailItems.length - before;
    if (added > 0) {
      const entries = detailItems.splice(before, added);
      detailItems.push({ type: "section", name });
      detailItems.push(...entries);
    }
  };

  const blank = () => detailItems.push({ type: "blank" });

  pushEntry("Uptime", uptimeStr);
  pushEntry("Location", profile.location);
  pushEntry("IDE", profile.ide);

  blank();
  pushEntry("Programming", profile.languages?.programming);
  pushEntry("Real", profile.languages?.real);

  blank();
  pushEntry("Frontend", profile.stack?.frontend);
  pushEntry("Backend", profile.stack?.backend);

  blank();
  pushEntry("Software", profile.hobbies?.software);
  pushEntry("Gaming", profile.hobbies?.gaming);

  blank();
  pushSection("Contact", () => {
    pushEntry("Portfolio", profile.contact?.portfolio);
    pushEntry("LinkedIn", profile.contact?.linkedin);
    pushEntry("npm", profile.contact?.npm);
  });

  blank();
  pushSection("GitHub Stats", () => {
    pushEntry("Repos", String(stats.repos));
    pushEntry("Stars", String(stats.stars));
    pushEntry("Commits", String(stats.commits));
    pushEntry("Followers", String(stats.followers));
  });

  // Layout — constantes unicas
  const FONT = "ui-monospace, SFMono-Regular, Consolas, monospace";
  const FONT_SIZE = 14;
  const TITLE_FONT_SIZE = FONT_SIZE + 3;
  const LINE_HEIGHT = 20;
  const CHAR_WIDTH = 8.43;
  const ASPECT = CHAR_WIDTH / LINE_HEIGHT;
  console.log(`aspect SVG (CHAR_WIDTH/LINE_HEIGHT): ${ASPECT.toFixed(4)}`);

  // ASCII scale (configurable)
  const ASCII_SCALE = Number(profile.layout?.asciiScale ?? 0.7);
  const asciiFontSize = FONT_SIZE * ASCII_SCALE;
  const asciiCharWidth = CHAR_WIDTH * ASCII_SCALE;
  const asciiLineHeight = LINE_HEIGHT * ASCII_SCALE;

  const PAD = 20;
  const GAP = 30;

  const entriesOnly = detailItems.filter((i) => i.type === "entry");
  const maxValLen = entriesOnly.reduce((m, e) => Math.max(m, e.value.length), 0);
  const maxKeyLen = entriesOnly.reduce((m, e) => Math.max(m, e.key.length), 0);
  // Ficha ~52 columnas max
  const TARGET_KEY_WIDTH = Math.max(maxKeyLen, 50 - 1 - maxValLen);
  const detailChars = Math.max(String(profile.displayName).length, TARGET_KEY_WIDTH + 1 + maxValLen);
  const detailColWidth = Math.round(detailChars * CHAR_WIDTH);
  const longestValue = entriesOnly.reduce((a, b) => (a.value.length >= b.value.length ? a : b), entriesOnly[0])?.value;
  if (detailChars > 50) {
    console.warn(`aviso: la ficha ocupa ${detailChars} columnas (objetivo ~50); valor mas largo: "${longestValue}"`);
  }
  const asciiColWidth = Math.round(trimmedWidth * asciiCharWidth);

  let detailRowCount = 2;
  for (const it of detailItems) {
    if (it.type === "section") detailRowCount += 2;
    else detailRowCount += 1;
  }
  const detailHeight = detailRowCount * LINE_HEIGHT;
  const asciiHeight = asciiTrimmed.length * asciiLineHeight;
  const contentHeight = Math.max(detailHeight, asciiHeight);

  const svgWidth = Math.round(PAD + asciiColWidth + GAP + detailColWidth + PAD);
  const svgHeight = Math.round(PAD * 2 + contentHeight);

  console.log(`viewBox: ${svgWidth} x ${svgHeight}`);
  if (svgWidth > 1000) console.warn(`aviso: ancho del viewBox (${svgWidth}) supera 1000 px`);

  const fullSep = ".".repeat(Math.max(1, detailChars));

  function renderSvgForTheme(themeName) {
    const theme = { ...THEME_DEFAULTS[themeName], ...(profile.theme?.[themeName] || {}) };
    const asciiTop = PAD + Math.max(0, Math.round((detailHeight - asciiHeight) / 2));
    const xAscii = PAD;
    const xDetails = Math.round(PAD + asciiColWidth + GAP);

    const baseline = (idx) => Math.round(PAD + FONT_SIZE + idx * LINE_HEIGHT);
    const asciiBaseline = (idx) => Math.round(asciiTop + asciiFontSize + idx * asciiLineHeight);

    const asciiElements = asciiTrimmed
      .map((line, idx) => `  <text x="${xAscii}" y="${asciiBaseline(idx)}" fill="${theme.ascii}" font-size="${asciiFontSize}" xml:space="preserve">${escXml(line)}</text>`)
      .join("\n");

    const detailElements = [];
    detailElements.push(`  <text x="${xDetails}" y="${baseline(0)}" fill="${theme.key}" font-size="${TITLE_FONT_SIZE}" font-weight="700" xml:space="preserve">${escXml(profile.displayName)}</text>`);
    detailElements.push(`  <text x="${xDetails}" y="${baseline(1)}" fill="${theme.dots}" xml:space="preserve">${fullSep}</text>`);

    let rowIdx = 2;
    for (const it of detailItems) {
      if (it.type === "blank") {
        rowIdx += 1;
      } else if (it.type === "section") {
        detailElements.push(`  <text x="${xDetails}" y="${baseline(rowIdx)}" fill="${theme.key}" font-weight="700" xml:space="preserve">${escXml(it.name)}</text>`);
        detailElements.push(`  <text x="${xDetails}" y="${baseline(rowIdx + 1)}" fill="${theme.dots}" xml:space="preserve">${fullSep}</text>`);
        rowIdx += 2;
      } else {
        const dots = ".".repeat(Math.max(1, TARGET_KEY_WIDTH - it.key.length));
        detailElements.push(`  <text x="${xDetails}" y="${baseline(rowIdx)}" xml:space="preserve"><tspan fill="${theme.key}">${escXml(it.key)}</tspan><tspan fill="${theme.dots}">${dots}</tspan><tspan fill="${theme.value}"> ${escXml(it.value)}</tspan></text>`);
        rowIdx += 1;
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="Ficha de perfil de Federico Bordón">
  <rect width="${svgWidth}" height="${svgHeight}" fill="${theme.bg}"/>
  <g font-family="${FONT}" font-size="${FONT_SIZE}" fill="${theme.text}">
${asciiElements}
${detailElements.join("\n")}
  </g>
</svg>`;
  }

  for (const theme of THEMES) {
    const svg = renderSvgForTheme(theme);
    const outPath = join(OUT_DIR, `${theme}_mode.svg`);
    let write = true;
    try {
      const existing = await readFile(outPath, "utf8");
      if (existing === svg) write = false;
    } catch {}
    if (write) await writeFile(outPath, svg, "utf8");
  }
  console.log("build completado");
}

main().catch((e) => { console.error(`error fatal: ${e.message}`); process.exitCode = 1; });