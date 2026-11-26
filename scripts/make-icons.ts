// Draws the app icon (a speech bubble with sound bars) and writes the PNGs
// in public/icons/. No image libraries: shapes are signed-distance functions,
// supersampled for smooth edges, and PNGs are encoded with node:zlib.
//   node scripts/make-icons.ts
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type RGB = [number, number, number];
const BG: RGB = [59, 111, 216]; // --accent
const FG: RGB = [255, 255, 255];

// --- Shapes in a 0..1 square ---------------------------------------------
function roundRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Inside test for the white artwork (bubble minus the bars). */
function artwork(x: number, y: number): boolean {
  // Bubble body plus a small tail at the bottom left.
  const body = roundRect(x, y, 0.5, 0.46, 0.3, 0.22, 0.12) <= 0;
  const tail = x > 0.27 && x < 0.42 && y > 0.6 && y < 0.79 && y - 0.6 < (0.42 - x) * 1.25;
  if (!(body || tail)) return false;
  // Three sound bars cut out of the bubble.
  const bars: [number, number][] = [
    [0.38, 0.06],
    [0.5, 0.11],
    [0.62, 0.16],
  ];
  for (const [bx, half] of bars) {
    if (roundRect(x, y, bx, 0.46, 0.028, half, 0.028) <= 0) return false;
  }
  return true;
}

function render(size: number, opts: { rounded: boolean; scale: number }): Buffer {
  const SS = 4; // supersamples per axis
  const rows: Buffer[] = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + RGBA
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const inBg = opts.rounded ? roundRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) <= 0 : true;
          if (!inBg) continue;
          bg++;
          // Scale the artwork around the centre (maskable icons need a safe zone).
          if (artwork(0.5 + (x - 0.5) / opts.scale, 0.5 + (y - 0.5) / opts.scale)) fg++;
        }
      }
      const n = SS * SS;
      const a = bg / n;
      const f = bg ? fg / bg : 0;
      const o = 1 + px * 4;
      for (let c = 0; c < 3; c++) row[o + c] = Math.round(BG[c] * (1 - f) + FG[c] * f);
      row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

// --- Minimal PNG encoder -------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Output --------------------------------------------------------------
const out = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(out, { recursive: true });
const icons: [string, number, { rounded: boolean; scale: number }][] = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  // Maskable: full-bleed background, artwork shrunk into the 80 % safe zone.
  ['icon-maskable-512.png', 512, { rounded: false, scale: 0.8 }],
  // iOS rounds the corners itself and shows transparency as black.
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
  ['favicon-32.png', 32, { rounded: true, scale: 1 }],
];
for (const [name, size, opts] of icons) {
  writeFileSync(join(out, name), render(size, opts));
  console.log(`public/icons/${name}`);
}
