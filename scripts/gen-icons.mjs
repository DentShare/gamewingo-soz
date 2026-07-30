/**
 * Генератор иконок каталога: изометрия, глянцевый пластик.
 * Иконка обязана объяснять игру — на гранях лежат цифры, буквы и знаки,
 * а силуэты разные: плитки, диски, стрелки, а не только кубы.
 *
 * Палитра строгая: бирюза #2FA7A0…#6FCFC7, оранжевый #FF7A00…#FFA94D,
 * белый #F4F4F4…#FFFFFF с серой тенью. Других цветов нет.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Иконки каталога: одна и та же картинка в хабе и в меню самой игры. */
const HUB_ICONS = join(ROOT, 'hub', 'icons');
mkdirSync(HUB_ICONS, { recursive: true });

const S = 512;
const CX = S / 2, CY = S / 2 - 10;
const K = 0.866;                 // cos 30°
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Габариты композиции в экранных координатах — по ним иконка вписывается в кадр. */
let BB;
const resetBB = () => { BB = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; };
function track(sx, sy) {
  if (sx < BB.x0) BB.x0 = sx;
  if (sy < BB.y0) BB.y0 = sy;
  if (sx > BB.x1) BB.x1 = sx;
  if (sy > BB.y1) BB.y1 = sy;
}
/** Учесть точку мира в габаритах. */
const trackWorld = (x, y, z) => track(px(x, y), py(x, y, z));

const px = (x, y) => CX + (x - y) * K;
const py = (x, y, z) => CY + (x + y) * 0.5 - z;
const P = (pts) => pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');

function mix(a, b, t) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
  const c = (u, v) => Math.round(u + (v - u) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

const TEAL = { lo: '#2FA7A0', hi: '#6FCFC7' };
const TEAL_D = { lo: '#2FA7A0', hi: '#4CBAB3' };
const TEAL_L = { lo: '#4CBAB3', hi: '#6FCFC7' };
const ORANGE = { lo: '#FF7A00', hi: '#FFA94D' };
const ORANGE_D = { lo: '#FF7A00', hi: '#FF9226' };
const WHITE = { lo: '#D9DEE1', hi: '#FFFFFF' };
const GREY_TOP = '#E3E8EA';

const faces = (m) => ({
  top: mix(m.lo, m.hi, 0.95),
  left: mix(m.lo, m.hi, 0.45),
  right: mix(m.lo, m.hi, 0.12),
});

/** Брусок: (x, y) — ближний левый угол основания, (w, d) — план, h — высота. */
function box(x, y, z, w, d, h, m) {
  const f = faces(m);
  for (const [ax, ay] of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) {
    trackWorld(ax, ay, z); trackWorld(ax, ay, z + h);
  }
  const t = [[px(x, y), py(x, y, z + h)], [px(x + w, y), py(x + w, y, z + h)],
             [px(x + w, y + d), py(x + w, y + d, z + h)], [px(x, y + d), py(x, y + d, z + h)]];
  const l = [[px(x, y + d), py(x, y + d, z + h)], [px(x + w, y + d), py(x + w, y + d, z + h)],
             [px(x + w, y + d), py(x + w, y + d, z)], [px(x, y + d), py(x, y + d, z)]];
  const r = [[px(x + w, y), py(x + w, y, z + h)], [px(x + w, y + d), py(x + w, y + d, z + h)],
             [px(x + w, y + d), py(x + w, y + d, z)], [px(x + w, y), py(x + w, y, z)]];
  return `
    <polygon points="${P(l)}" fill="${f.left}"/>
    <polygon points="${P(r)}" fill="${f.right}"/>
    <polygon points="${P(t)}" fill="${f.top}"/>
    <polygon points="${P(t)}" fill="#FFFFFF" opacity=".16"/>`;
}

/** Диск (низкий цилиндр): круг в изометрии — эллипс rx = 1.2247r, ry = 0.7071r. */
function disc(x, y, z, r, h, m) {
  const f = faces(m);
  const rx = 1.2247 * r, ry = 0.7071 * r;
  const cx = px(x, y), cyTop = py(x, y, z + h), cyBot = py(x, y, z);
  track(cx - rx, cyTop - ry); track(cx + rx, cyBot + ry);
  return `
    <ellipse cx="${cx.toFixed(1)}" cy="${cyBot.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${f.right}"/>
    <rect x="${(cx - rx).toFixed(1)}" y="${cyTop.toFixed(1)}" width="${(rx * 2).toFixed(1)}" height="${(cyBot - cyTop).toFixed(1)}" fill="${f.left}"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${cyTop.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${f.top}"/>
    <ellipse cx="${cx.toFixed(1)}" cy="${cyTop.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#FFFFFF" opacity=".14"/>`;
}

let sphereId = 0;
function sphere(x, y, z, r, m) {
  const id = `sp${sphereId++}`;
  const cx = px(x, y), cy = py(x, y, z);
  track(cx - r, cy - r); track(cx + r, cy + r);
  return `
    <defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="${m.hi}"/><stop offset="1" stop-color="${m.lo}"/>
    </radialGradient></defs>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${id})"/>
    <ellipse cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.34).toFixed(1)}"
             rx="${(r * 0.3).toFixed(1)}" ry="${(r * 0.19).toFixed(1)}" fill="#FFFFFF" opacity=".45"/>`;
}

function shadow(x, y, rx = 170, ry = 58, o = 0.3) {
  return `<ellipse cx="${px(x, y).toFixed(1)}" cy="${py(x, y, 0).toFixed(1)}"
            rx="${rx}" ry="${ry}" fill="#B9C3C7" opacity="${o}" filter="url(#soft)"/>`;
}

function recess(x, y, z, w, d) {
  for (const [ax, ay] of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) trackWorld(ax, ay, z);
  const t = [[px(x, y), py(x, y, z)], [px(x + w, y), py(x + w, y, z)],
             [px(x + w, y + d), py(x + w, y + d, z)], [px(x, y + d), py(x, y + d, z)]];
  return `<polygon points="${P(t)}" fill="${GREY_TOP}"/>`;
}

const plate = (x, y, w, d, h = 18) => box(x, y, 0, w, d, h, WHITE);

/**
 * «Наклейка» на верхней грани: содержимое рисуется в плоских координатах,
 * а матрица кладёт его на изометрическую плоскость (u вдоль X, v вдоль Y).
 */
function decal(x, y, z, inner, r = 0) {
  if (r) {
    for (const [u, v] of [[-r, -r], [r, -r], [r, r], [-r, r]]) trackWorld(x + u, y + v, z);
  }
  const m = `matrix(${K} .5 ${-K} .5 ${px(x, y).toFixed(1)} ${py(x, y, z).toFixed(1)})`;
  return `<g transform="${m}">${inner}</g>`;
}

/**
 * Объёмная фигура: контур задан в координатах грани, вытянут вниз на h.
 * Боковины рисуются до верхней грани, поэтому силуэт читается как призма.
 */
function extrude(x, y, z, pts, h, m) {
  const f = faces(m);
  const world = pts.map(([u, v]) => [x + u, y + v]);
  world.forEach(([wx, wy]) => { trackWorld(wx, wy, z); trackWorld(wx, wy, z + h); });
  const top = world.map(([wx, wy]) => [px(wx, wy), py(wx, wy, z + h)]);
  const bot = world.map(([wx, wy]) => [px(wx, wy), py(wx, wy, z)]);
  const sides = world.map((_, i) => {
    const j = (i + 1) % world.length;
    return `<polygon points="${P([top[i], top[j], bot[j], bot[i]])}" fill="${f.left}"/>`;
  }).join('');
  return `${sides}
    <polygon points="${P(top)}" fill="${f.top}"/>
    <polygon points="${P(top)}" fill="#FFFFFF" opacity=".16"/>`;
}

/** Цифра или буква, лежащая на грани. */
const label = (x, y, z, text, size, fill = '#FFFFFF') =>
  decal(x, y, z, `<text x="0" y="0" font-family="${FONT}" font-size="${size}" font-weight="700"
      fill="${fill}" text-anchor="middle" dominant-baseline="central">${text}</text>`, size * 0.62);

/** Плоская фигура на грани: массив точек в координатах грани. */
const shape = (x, y, z, pts, fill) =>
  decal(x, y, z, `<polygon points="${pts.map(([a, b]) => `${a},${b}`).join(' ')}" fill="${fill}"/>`,
    Math.max(...pts.flat().map(Math.abs)));

/** Стрелка-шеврон на грани: направление dir = 'up' | 'down' | 'right'. */
function chevron(x, y, z, size, fill, dir = 'up') {
  const s = size;
  const up = [[0, -s], [s * 0.9, s * 0.15], [s * 0.36, s * 0.15], [s * 0.36, s], [-s * 0.36, s],
              [-s * 0.36, s * 0.15], [-s * 0.9, s * 0.15]];
  const pts = dir === 'up' ? up
    : dir === 'down' ? up.map(([a, b]) => [a, -b])
    : up.map(([a, b]) => [b, a]);
  return shape(x, y, z, pts, fill);
}

/** Доля кадра под композицию: 0.84 — по 8 % воздуха с каждой стороны. */
const SAFE = 0.84;
let LAST_FIT = null;

/**
 * Вписывает готовую композицию в кадр: считает её габариты, масштабирует
 * до безопасной зоны и центрирует. Ни одна иконка не обрезается краем.
 */
function svg(body) {
  const w = BB.x1 - BB.x0, h = BB.y1 - BB.y0;
  const k = Math.min((S * SAFE) / w, (S * SAFE) / h, 1.35);
  const cx = (BB.x0 + BB.x1) / 2, cy = (BB.y0 + BB.y1) / 2;
  const tx = S / 2 - cx * k, ty = S / 2 - cy * k;
  LAST_FIT = { mx: (S - w * k) / 2, my: (S - h * k) / 2 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${k.toFixed(4)})">
${body}
  </g>
</svg>`;
}

// ── Композиции ───────────────────────────────────────────────────────────────
const ICONS = {
  // 5 букв: три буквенные плитки — угадана (бирюза), не на месте (оранж), пустая
  soz: () => [
    shadow(0, 0, 180, 60),
    box(-200, -75, 0, 130, 130, 46, WHITE),
    label(-135, -10, 46, 'С', 78, '#9AA4A8'),
    box(-60, -75, 0, 130, 130, 78, TEAL),
    label(5, -10, 78, 'Л', 78),
    box(80, -75, 0, 130, 130, 62, ORANGE),
    label(145, -10, 62, 'О', 78),
  ],

  // Найди пару: две одинаковые открытые карточки и закрытая со знаком «?»
  pairs: () => [
    shadow(0, 0, 180, 60),
    box(-215, -70, 0, 130, 130, 30, WHITE),
    decal(-150, -5, 30, star(46, '#FF8A1A')),
    box(-70, -70, 0, 130, 130, 30, WHITE),
    decal(-5, -5, 30, star(46, '#FF8A1A')),
    box(75, -70, 0, 130, 130, 30, ORANGE),
    label(140, -5, 30, '?', 74),
  ],

  // Пятнашки: лоток 2×2, плитки 1–2–3 и пустой слот со стрелкой
  fifteen: () => [
    shadow(0, 0, 190, 62),
    plate(-190, -190, 380, 380, 20),
    recess(10, 10, 20, 160, 160),
    chevron(90, 90, 21, 46, '#C9D2D6', 'right'),
    box(-170, -170, 20, 160, 160, 50, TEAL),
    label(-90, -90, 70, '1', 84),
    box(10, -170, 20, 160, 160, 50, ORANGE),
    label(90, -90, 70, '2', 84),
    box(-170, 10, 20, 160, 160, 50, ORANGE),
    label(-90, 90, 70, '3', 84),
  ],

  // 2048: три плитки с номиналами 2 → 4 → 8
  2048: () => [
    shadow(0, 0, 175, 58),
    box(-150, 20, 0, 105, 105, 50, TEAL),
    label(-97, 72, 50, '2', 58),
    box(-58, -48, 0, 125, 125, 86, ORANGE_D),
    label(5, 15, 86, '4', 70),
    box(35, -110, 0, 130, 130, 124, ORANGE),
    label(100, -45, 124, '8', 74),
  ],

  // Мини-судоку: доска 2×2, цифры 1 и 2, две клетки пустые
  'sudoku-kids': () => [
    shadow(0, 0, 190, 62),
    plate(-190, -190, 380, 380, 20),
    recess(10, -170, 20, 160, 160),
    recess(-170, 10, 20, 160, 160),
    box(-170, -170, 20, 160, 160, 42, ORANGE),
    label(-90, -90, 62, '1', 84),
    box(10, 10, 20, 160, 160, 42, TEAL),
    label(90, 90, 62, '2', 84),
  ],

  // Башня: слои со смещением и шеврон роста над верхним
  stack: () => [
    shadow(0, 55, 165, 54),
    box(-160, -160, 0, 300, 300, 46, ORANGE),
    box(-135, -130, 46, 260, 260, 46, TEAL),
    box(-110, -105, 92, 220, 220, 46, ORANGE),
    box(-75, -70, 138, 180, 180, 44, TEAL),
    chevron(15, 20, 182 + 34, 44, '#FF8A1A', 'up'),
  ],

  // Полёт: две опоры с проёмом и стрела-кораблик, летящая насквозь
  flyer: () => [
    shadow(0, 0, 165, 56),
    box(-225, -55, 0, 110, 110, 235, ORANGE),
    decal(-5, 0, 150, `
      <polygon points="-92,-62 86,0 -92,62 -52,0" fill="#4CBAB3"/>
      <polygon points="-92,-62 86,0 -52,0" fill="#6FCFC7"/>
      <circle cx="-116" cy="0" r="13" fill="#6FCFC7" opacity=".75"/>
      <circle cx="-152" cy="0" r="10" fill="#6FCFC7" opacity=".5"/>
      <circle cx="-184" cy="0" r="7" fill="#6FCFC7" opacity=".3"/>`, 195),
    box(115, -55, 0, 110, 110, 235, ORANGE),
  ],

  // Меткий глаз: круглая мишень кольцами и прицел в центре
  targets: () => [
    shadow(0, 0, 175, 58),
    disc(0, 0, 0, 200, 26, WHITE),
    disc(0, 0, 26, 165, 14, ORANGE),
    disc(0, 0, 40, 112, 14, WHITE),
    disc(0, 0, 54, 62, 14, ORANGE),
    decal(0, 0, 68, `
      <circle cx="0" cy="0" r="52" fill="none" stroke="#FFFFFF" stroke-width="9" opacity=".9"/>
      <rect x="-4.5" y="-84" width="9" height="42" fill="#FFFFFF"/>
      <rect x="-4.5" y="42" width="9" height="42" fill="#FFFFFF"/>
      <rect x="-84" y="-4.5" width="42" height="9" fill="#FFFFFF"/>
      <rect x="42" y="-4.5" width="42" height="9" fill="#FFFFFF"/>`),
    sphere(0, 0, 128, 30, TEAL),
  ],

  // Змейка: тело с головой и глазом, яблоко с листом на соседней клетке
  snake: () => [
    shadow(0, 0, 190, 62),
    plate(-190, -190, 380, 380, 18),
    recess(-170, -170, 18, 130, 130),
    box(-168, 42, 18, 118, 118, 38, TEAL_D),
    box(-38, 42, 18, 118, 118, 38, TEAL_L),
    box(-38, -88, 18, 118, 118, 38, TEAL_D),
    box(92, -88, 18, 118, 118, 52, TEAL_L),
    decal(151, -29, 70, `
      <circle cx="-14" cy="-6" r="11" fill="#FFFFFF"/>
      <circle cx="14" cy="6" r="11" fill="#FFFFFF"/>
      <circle cx="-11" cy="-4" r="5" fill="#2FA7A0"/>
      <circle cx="17" cy="8" r="5" fill="#2FA7A0"/>`),
    sphere(-105, -105, 18 + 44, 44, ORANGE),
    decal(-105, -105, 18 + 86, `<ellipse cx="20" cy="-10" rx="24" ry="11" fill="#3FB2AB"/>`),
  ],

  // Сортировка: две ячейки, в каждой своя фигура, сверху стрелки «положи сюда»
  sorting: () => [
    shadow(0, 0, 190, 62),
    plate(-195, -140, 390, 280, 24),
    recess(-175, -120, 24, 160, 240),
    recess(15, -120, 24, 160, 240),
    extrude(-95, 0, 24, [[0, -66], [62, 42], [-62, 42]], 34, ORANGE),
    disc(95, 0, 24, 62, 34, TEAL),
    chevron(-95, 0, 118, 30, '#FF8A1A', 'down'),
    chevron(95, 0, 118, 30, '#3FB2AB', 'down'),
  ],

  // Счёт: три предмета и плитка с ответом «3»
  counting: () => [
    shadow(0, 0, 185, 60),
    plate(-195, -150, 390, 300, 20),
    sphere(-120, -70, 20 + 42, 42, ORANGE),
    sphere(-120, 30, 20 + 42, 42, ORANGE),
    sphere(-20, -20, 20 + 42, 42, ORANGE),
    box(60, -70, 20, 130, 130, 56, TEAL),
    label(125, -5, 76, '3', 86),
  ],
};

/** Пятиконечная звезда в плоских координатах грани. */
function star(r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

for (const [slug, build] of Object.entries(ICONS)) {
  resetBB();
  const body = build().join('\n');
  const out = svg(body);
  writeFileSync(join(HUB_ICONS, `${slug}.svg`), out);
  // Та же иконка едет в игру — меню показывает её же, а не свой значок.
  const pub = join(ROOT, 'games', slug, 'public');
  if (existsSync(pub)) writeFileSync(join(pub, 'icon.svg'), out);
  console.log(`  ${slug.padEnd(12)} поля ${LAST_FIT.mx.toFixed(0)}×${LAST_FIT.my.toFixed(0)} px из 512`);
}
console.log(`✓ ${Object.keys(ICONS).length} иконок → hub/icons и games/<slug>/public/icon.svg`);
