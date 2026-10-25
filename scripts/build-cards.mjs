#!/usr/bin/env node
/**
 * Genera las tarjetas SVG del README en dos variantes (papel / noche).
 * Uso: node scripts/build-cards.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = join(process.cwd(), "assets", "cards");
mkdirSync(OUT, { recursive: true });

const themes = {
  paper: {
    bgTop: "#FAF8F4",
    bgBottom: "#F3F0E9",
    border: "#E3DDD2",
    accent: "#9E3E31",
    kicker: "#8B8478",
    title: "#171512",
    body: "#5F5A52",
    meta: "#8B8478",
    seal: "#9E3E31",
  },
  night: {
    bgTop: "#181614",
    bgBottom: "#111010",
    border: "#2C2925",
    accent: "#C0553F",
    kicker: "#8F877C",
    title: "#F5F2EC",
    body: "#A39C92",
    meta: "#7D766D",
    seal: "#C0553F",
  },
};

const cards = [
  {
    slug: "nuvio",
    kicker: "PRODUCTO · IA APLICADA",
    title: "Nuvio",
    lines: ["Subís un estudio médico y la IA explica", "cada valor en lenguaje claro."],
    stack: "next.js · typescript · supabase · gemini",
    cta: "DEMO ↗",
    label: "Nuvio: plataforma que explica estudios médicos con IA",
  },
  {
    slug: "hush",
    kicker: "OPEN SOURCE · NPM",
    title: "Hush",
    lines: ["Telemetría discreta para la TUI de OpenCode:", "contexto, rama y métricas de sesión."],
    stack: "typescript · solid · opencode plugin",
    cta: "NPM ↗",
    label: "Hush: plugin de telemetría para la TUI de OpenCode",
  },
  {
    slug: "copa-chapa-chapa",
    kicker: "PLATAFORMA · DATOS EN VIVO",
    title: "Copa Chapa Chapa",
    lines: ["Campeonato argentino de simracing: splits,", "clasificaciones e historial de campeones."],
    stack: "next.js · google sheets api · vercel",
    cta: "DEMO ↗",
    label: "Copa Chapa Chapa: plataforma del campeonato argentino de simracing",
  },
  {
    slug: "devnull",
    kicker: "E-COMMERCE · PRODUCTO",
    title: "DEV/NULL",
    lines: ["Ropa para programadores: catálogo, guía", "de talles y carrito con estado compartido."],
    stack: "next.js · tailwind · typescript",
    cta: "CÓDIGO ↗",
    label: "DEV/NULL: tienda de ropa para programadores",
  },
];

const sans = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function card(c, t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="180" viewBox="0 0 460 180" role="img" aria-label="${esc(c.label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${t.bgTop}"/>
      <stop offset="1" stop-color="${t.bgBottom}"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="459" height="179" rx="14" fill="url(#bg)" stroke="${t.border}"/>
  <rect x="0" y="34" width="3" height="112" rx="1.5" fill="${t.accent}"/>
  <rect x="28" y="36" width="6" height="6" rx="1" fill="${t.seal}"/>
  <text x="42" y="42.5" font-family="${mono}" font-size="10.5" letter-spacing="2.1" fill="${t.kicker}">${esc(c.kicker)}</text>
  <text x="430" y="42.5" text-anchor="end" font-family="${mono}" font-size="10.5" letter-spacing="1" fill="${t.accent}">${esc(c.cta)}</text>
  <text x="28" y="86" font-family="${sans}" font-size="25" font-weight="700" letter-spacing="-0.6" fill="${t.title}">${esc(c.title)}</text>
  <text x="28" y="114" font-family="${sans}" font-size="13.5" fill="${t.body}">${esc(c.lines[0])}</text>
  <text x="28" y="134" font-family="${sans}" font-size="13.5" fill="${t.body}">${esc(c.lines[1])}</text>
  <text x="28" y="159" font-family="${mono}" font-size="10" letter-spacing="0.4" fill="${t.meta}">${esc(c.stack)}</text>
</svg>
`;
}

for (const c of cards) {
  for (const [name, t] of Object.entries(themes)) {
    const file = join(OUT, `${c.slug}-${name}.svg`);
    writeFileSync(file, card(c, t), "utf8");
    console.log("ok", file);
  }
}
