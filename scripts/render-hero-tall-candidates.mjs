#!/usr/bin/env node
// TIM-1858: Portrait (1024x1536) hero candidates in the EXACT original crisp
// line-art style of hero-your-coffee-shop.webp (TIM-1579 §2):
//   - uniform thin off-white (#faf9f7) outline strokes
//   - outline-only, NO fills, NO blur
//   - transparent background (composites onto the teal field in-app)
//
// This is the deterministic SVG/vector path (Lane A, TIM-1580/TIM-1697). It is
// crisp at any size and never drifts to fills/gold/blur the way the gpt-image
// portrait re-renders did. Layout/scene composition differs across candidates
// (board approved layout change on TIM-1576) — only the STYLE must match.
//
// Usage: node scripts/render-hero-tall-candidates.mjs
// Outputs candidate-{a,b,c}.{svg,webp,png} under /tmp/hero-candidates/

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const W = 1024;
const H = 1536;
const STROKE = "#faf9f7";
const SW = 3.4; // thin uniform weight, matches the original's hairline strokes

// ── primitive emitters (local coords) ──────────────────────────────────────
const s = (d) => `<path d="${d}"/>`;
const e = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const ln = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const rrect = (x, y, w, h, r) =>
  s(`M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`);
const at = (x, y, body) => `<g transform="translate(${x} ${y})">${body}</g>`;

// ── object library (drawn around a local origin) ────────────────────────────

// Espresso machine: body w/ two group heads, portafilters, drip tray, feet.
function espressoMachine() {
  return [
    rrect(0, 40, 360, 92, 10), // main body
    rrect(8, 0, 344, 48, 8), // raised top deck
    e(70, 24, 16, 9), e(160, 24, 16, 9), // two top boilers / pressure gauges
    ln(40, 132, 40, 150), ln(320, 132, 320, 150), // feet
    ln(0, 150, 360, 150), // base shelf
    // group head 1 + portafilter
    s("M 90 132 v 18 h 34 v -18"), s("M 96 168 h 22 l 10 14 h -42 z"),
    // group head 2 + portafilter
    s("M 230 132 v 18 h 34 v -18"), s("M 236 168 h 22 l 10 14 h -42 z"),
    // control dials
    e(300, 86, 9, 9), e(330, 86, 9, 9),
  ].join("");
}

// Conical burr grinder: hopper cone + body + chute.
function grinder() {
  return [
    s("M 6 0 L 84 0 L 64 56 L 26 56 Z"), // hopper cone
    rrect(20, 56, 50, 96, 8), // body
    s("M 30 152 h 30 v 16 h -30 z"), // chute / dosing
  ].join("");
}

// Gooseneck kettle: body, lid knob, handle, swan-neck spout.
function kettle() {
  return [
    s("M 20 78 C 16 30 60 18 78 18 C 96 18 140 30 136 78 C 134 96 120 104 78 104 C 36 104 22 96 20 78 Z"), // body
    e(78, 18, 22, 7), // lid seam
    ln(78, 11, 78, 4), e(78, 4, 6, 4), // knob
    s("M 132 44 C 178 36 188 4 176 -10"), // gooseneck spout
    s("M 24 40 C -8 44 -8 92 22 96"), // handle
  ].join("");
}

// Pour-over dripper on a glass carafe.
function pourOver() {
  return [
    s("M 8 0 L 92 0 L 62 56 L 38 56 Z"), // cone
    ln(20, 14, 80, 14), // rim band
    s("M 38 56 L 38 70 L 62 70 L 62 56"), // neck
    s("M 26 70 C 22 132 30 150 50 150 C 70 150 78 132 74 70 Z"), // carafe
    s("M 74 92 C 104 92 108 128 78 134"), // carafe handle
  ].join("");
}

// Storage jar (cylinder + lid).
function jar(w = 44, h = 78) {
  return [
    e(w / 2, 6, w / 2, 6), // lid top ellipse
    ln(0, 6, 0, 14), ln(w, 6, w, 14), s(`M 0 14 Q ${w / 2} 20 ${w} 14`), // lid band
    s(`M 4 18 L 4 ${h} Q ${w / 2} ${h + 8} ${w - 4} ${h} L ${w - 4} 18`), // body
  ].join("");
}

// Simple cup (rim + tapered wall + handle).
function cup(w = 46) {
  return [
    e(w / 2, 4, w / 2, 4), // rim
    s(`M 4 6 C 4 44 ${w * 0.18} 58 ${w / 2} 58 C ${w * 0.82} 58 ${w - 4} 44 ${w - 4} 6`), // wall
    s(`M ${w - 4} 14 C ${w + 18} 14 ${w + 20} 40 ${w - 6} 44`), // handle
  ].join("");
}

// Bottle (tall, narrow neck).
function bottle(h = 92) {
  return s(`M 12 ${h} L 12 34 L 8 26 L 8 6 L 24 6 L 24 26 L 20 34 L 20 ${h} Z`);
}

// Window with frame, mullions and a hint of skyline behind it.
function window(w, h) {
  const midx = w / 2;
  const midy = h / 2;
  return [
    rrect(0, 0, w, h, 4), // outer frame
    rrect(10, 10, w - 20, h - 20, 2), // inner frame
    ln(midx, 10, midx, h - 10), // vertical mullion
    ln(10, midy, w - 10, midy), // horizontal mullion
    // simple skyline silhouette inside lower panes
    s(`M 24 ${h - 14} V ${midy + 30} H 48 V ${midy + 10} H 72 V ${midy + 40} H 96 V ${h - 14}`),
    s(`M ${midx + 18} ${h - 14} V ${midy + 36} H ${midx + 40} V ${midy + 16} H ${midx + 64} V ${midy + 30} H ${midx + 86} V ${h - 14}`),
  ].join("");
}

// Pendant lamp: cord + dome + base nub.
function pendant(cordLen = 150) {
  return [
    ln(60, 0, 60, cordLen),
    s(`M 14 ${cordLen + 56} C 14 ${cordLen + 14} 106 ${cordLen + 14} 106 ${cordLen + 56} Z`), // dome
    ln(20, cordLen + 56, 100, cordLen + 56), // dome lip
    e(60, cordLen + 62, 7, 4), // bulb nub
  ].join("");
}

// Trailing hanging plant: hook + pot + three gently swaying strands with leaf
// ticks splaying outward (open outline, no coil).
function hangingPlant() {
  const strands = [];
  const cfg = [
    { x: -16, len: 210, sway: -22 },
    { x: 0, len: 260, sway: 6 },
    { x: 16, len: 200, sway: 24 },
  ];
  for (const { x, len, sway } of cfg) {
    const top = 52;
    const tipx = x + sway;
    // main strand: gentle S toward the tip
    strands.push(s(`M ${x} ${top} C ${x + sway * 0.4} ${top + len * 0.45} ${tipx - sway * 0.3} ${top + len * 0.7} ${tipx} ${top + len}`));
    // leaf ticks alternating off the strand
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      const ly = top + len * t;
      const lx = x + sway * t;
      const dir = i % 2 === 0 ? 1 : -1;
      strands.push(s(`M ${lx} ${ly} q ${dir * 16} -2 ${dir * 22} 10`));
    }
  }
  return [
    ln(0, 0, 0, 30), // hanger cord
    s("M -26 30 L 26 30 L 18 52 L -18 52 Z"), // pot
    ln(-22, 38, 22, 38), // pot rim band
    ...strands,
  ].join("");
}

// Potted leafy plant (snake/monstera-ish open outline).
function pottedPlant() {
  return [
    s("M 30 60 L 70 60 L 62 110 L 38 110 Z"), // pot
    ln(34, 72, 66, 72), // pot rim band
    s("M 50 60 C 30 6 14 -2 8 6 C 22 14 34 34 46 60"), // left frond
    s("M 50 60 C 70 4 86 -4 92 6 C 78 16 66 36 54 60"), // right frond
    s("M 50 60 C 50 -2 52 -8 52 -8"), // center stem
    s("M 50 30 C 30 22 22 26 20 30 C 30 36 40 36 50 38"), // left leaf
    s("M 50 30 C 70 22 78 26 80 30 C 70 36 60 36 50 38"), // right leaf
  ].join("");
}

// Wall menu board: frame + ruled text lines (two columns).
function menuBoard(w, h) {
  const lines = [];
  const colY = 28;
  const gap = (h - 48) / 5;
  for (let i = 0; i < 5; i++) {
    const y = colY + i * gap;
    lines.push(ln(24, y, w / 2 - 18, y));
    lines.push(ln(w / 2 + 10, y, w - 24 - (i % 2) * 30, y));
  }
  return [rrect(0, 0, w, h, 4), rrect(8, 8, w - 16, h - 16, 2), ...lines].join("");
}

// A counter / shelf baseline pair (double line, like the original).
function shelfLine(len) {
  return [ln(0, 0, len, 0), ln(0, 7, len, 7)].join("");
}

// ── candidate compositions (each returns the inner SVG body) ────────────────

// A — counter-forward (closest to the original): window + hanging plant + pendant
// up top, a full shelf of vessels mid, the espresso bar + grinder + kettle on the
// counter, double counter baseline at the bottom.
function candidateA() {
  return [
    at(140, 150, window(420, 320)),
    at(720, 150, hangingPlant()),
    at(580, 70, pendant(150)),
    // mid shelf with vessels
    at(110, 720, shelfLine(820)),
    at(150, 640, jar(46, 80)),
    at(220, 642, jar(40, 78)),
    at(300, 662, cup(48)),
    at(400, 632, pourOver()),
    at(520, 644, jar(44, 76)),
    at(600, 662, cup(46)),
    at(700, 632, pourOver()),
    at(820, 642, bottle(78)),
    at(872, 644, bottle(72)),
    // counter zone
    at(120, 1180, espressoMachine()),
    at(520, 1176, grinder()),
    at(640, 1248, kettle()),
    at(830, 1220, pottedPlant()),
    // counter baseline (double line) + faint floor line
    at(40, 1372, shelfLine(944)),
    at(40, 1452, shelfLine(944)),
  ].join("");
}

// B — window-led vertical: a tall window dominates the top third, a trailing plant
// and pendant frame it, a compact counter row (machine + pour-overs + cups) sits low.
function candidateB() {
  return [
    at(280, 120, window(460, 540)),
    at(150, 150, pendant(150)),
    at(840, 130, hangingPlant()),
    // single floating shelf with a few vessels
    at(150, 900, shelfLine(740)),
    at(190, 820, jar(46, 76)),
    at(262, 824, jar(40, 72)),
    at(340, 836, cup(48)),
    at(450, 792, pourOver()),
    at(580, 824, bottle(72)),
    at(650, 836, cup(46)),
    at(740, 824, jar(44, 74)),
    // counter row
    at(120, 1230, espressoMachine()),
    at(540, 1298, pourOver()),
    at(680, 1270, grinder()),
    at(800, 1300, kettle()),
    // baselines
    at(40, 1396, shelfLine(944)),
    at(40, 1470, shelfLine(944)),
  ].join("");
}

// C — symmetrical "wall + counter": menu board and a potted plant flank the top,
// two stacked shelves of vessels in the middle, the espresso bar centered below.
function candidateC() {
  return [
    at(120, 130, menuBoard(440, 300)),
    at(760, 150, pottedPlant()),
    at(660, 90, pendant(150)),
    // upper shelf
    at(120, 660, shelfLine(800)),
    at(170, 584, jar(46, 76)),
    at(244, 588, cup(48)),
    at(340, 570, pourOver()),
    at(480, 586, jar(44, 74)),
    at(570, 600, cup(46)),
    at(690, 570, pourOver()),
    at(820, 588, bottle(72)),
    // lower shelf
    at(120, 920, shelfLine(800)),
    at(180, 842, cup(50)),
    at(280, 846, jar(44, 74)),
    at(380, 850, cup(46)),
    at(480, 840, bottle(80)),
    at(570, 846, jar(40, 74)),
    at(670, 850, cup(48)),
    at(770, 844, jar(46, 76)),
    // centered counter
    at(330, 1240, espressoMachine()),
    at(180, 1308, grinder()),
    at(760, 1312, kettle()),
    // baselines
    at(40, 1408, shelfLine(944)),
    at(40, 1474, shelfLine(944)),
  ].join("");
}

function frame(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <g fill="none" stroke="${STROKE}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">
${body}
  </g>
</svg>`;
}

async function render(name, body) {
  const svg = frame(body);
  const outDir = "/tmp/hero-candidates";
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${name}.svg`), svg);
  // transparent raster outputs (no background rect -> alpha stays transparent)
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${name}.png`));
  await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outDir, `${name}.webp`));
  console.log(`✓ ${name} → ${outDir}/${name}.{svg,png,webp}`);
}

async function main() {
  await render("candidate-a", candidateA());
  await render("candidate-b", candidateB());
  await render("candidate-c", candidateC());
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
