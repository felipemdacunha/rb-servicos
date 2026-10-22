// Gera a logo R&B Serviços em SVG (texto convertido em desenho) e os PNGs (ícones e PDF).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

const out = process.argv[2];
mkdirSync(join(out, "icons"), { recursive: true });
const font = opentype.loadSync(fileURLToPath(new URL("./node_modules/@fontsource/kaushan-script/files/kaushan-script-latin-400-normal.woff", import.meta.url)));

const RED = "#e8372f";
const WHITE = "#f4f4f4";

function textPath(text, size, x, y, anchor = "start") {
  const width = font.getAdvanceWidth(text, size);
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  return font.getPath(text, left, y, size).toPathData(2);
}

// Carro de frente em traço (como o bordado).
const car = `
<g fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
  <!-- teto e para-brisa -->
  <path d="M150 150 C160 112 186 84 226 74 C290 62 350 62 414 74 C454 84 480 112 490 150"/>
  <path d="M168 150 C250 138 390 138 472 150"/>
  <!-- retrovisores -->
  <path d="M150 150 L118 138 L104 148 L108 160 L156 164"/>
  <path d="M490 150 L522 138 L536 148 L532 160 L484 164"/>
  <!-- capô -->
  <path d="M146 176 C250 162 390 162 494 176"/>
  <path d="M146 176 L124 204 M494 176 L516 204"/>
  <!-- faróis -->
  <path d="M120 206 L212 200 L226 224 L132 236 Z"/>
  <path d="M520 206 L428 200 L414 224 L508 236 Z"/>
  <circle cx="150" cy="219" r="7" fill="${RED}" stroke="none"/>
  <circle cx="490" cy="219" r="7" fill="${RED}" stroke="none"/>
  <!-- grade -->
  <path d="M236 196 L404 196 L420 222 L406 288 L234 288 L220 222 Z"/>
  <path d="M236 212 H404 M232 228 H408 M232 244 H408 M234 260 H406 M236 274 H404"/>
  <!-- laterais e para-choque -->
  <path d="M120 206 L114 262 L120 300"/>
  <path d="M520 206 L526 262 L520 300"/>
  <path d="M132 252 L220 256 M508 252 L420 256"/>
  <path d="M120 272 L222 278 M520 272 L418 278"/>
  <path d="M120 300 C250 316 390 316 520 300"/>
  <!-- rodas -->
  <path d="M130 304 V332 H182 V312"/>
  <path d="M510 304 V332 H458 V312"/>
</g>`;

const rb = textPath("R&B", 150, 296, 470, "middle");
const servicos = textPath("SERVIÇOS", 34, 446, 478, "start");

const W = 640, H = 455, Y0 = 50;
const logoBody = `${car}
<path d="${rb}" fill="${WHITE}"/>
<path d="${servicos}" fill="${WHITE}" transform="rotate(-6 446 478)"/>`;

// Logo transparente (para fundo escuro) e versão com fundo grafite (ícones e PDF).
const svg = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${Y0} ${W} ${H}" width="${W}" height="${H}">${bg ?? ""}${logoBody}</svg>`;
writeFileSync(join(out, "logo.svg"), svg());

// Ícone quadrado: fundo grafite com a logo centralizada.
const iconSvg = (pad) => {
  const size = 640;
  const scale = (size - pad * 2) / W;
  const y = (size - H * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#141518"/><g transform="translate(${pad} ${y}) scale(${scale}) translate(0 -${Y0})">${logoBody}</g></svg>`;
};
const render = (s, size, file) => sharp(Buffer.from(s)).resize(size, size).png().toFile(join(out, file));
await render(iconSvg(40), 512, "icons/icon-512.png");
await render(iconSvg(40), 192, "icons/icon-192.png");
await render(iconSvg(110), 512, "icons/icon-maskable-512.png");
await render(iconSvg(40), 180, "icons/apple-touch-icon.png");
await render(iconSvg(24), 64, "icons/favicon-64.png");
// PDF: logo transparente em alta resolução (o PDF desenha o fundo escuro).
await sharp(Buffer.from(svg())).resize(960).png().toFile(join(out, "logo-pdf.png"));
console.log("ok");
