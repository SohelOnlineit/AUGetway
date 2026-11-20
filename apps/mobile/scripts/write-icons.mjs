import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const brand = [38, 191, 176, 255];
const ink = [1, 19, 26, 255];
const paper = [248, 250, 252, 255];
const clear = [0, 0, 0, 0];

const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
};

function crc32(buffer) {
  let crc = ~0;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(width, height, paint) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y, width, height);
      const index = row + 1 + x * 4;
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paintMark(x, y, size, letter, backdrop) {
  const center = size / 2;
  const dx = x + 0.5 - center;
  const dy = y + 0.5 - center;
  const distance = Math.hypot(dx, dy);
  const radius = size * 0.3;
  const edge = radius + 1.2;
  if (distance > edge) return backdrop;
  const rows = glyphs[letter];
  const cell = size * 0.046;
  const originX = center - (rows[0].length * cell) / 2;
  const originY = center - (rows.length * cell) / 2;
  const column = Math.floor((x - originX) / cell);
  const row = Math.floor((y - originY) / cell);
  const onLetter = rows[row]?.[column] === "1";
  const fill = onLetter ? paper : brand;
  if (distance < radius - 1.2) return fill;
  const cover = Math.max(0, Math.min(1, (edge - distance) / 2.4));
  return fill.map((channel, index) => Math.round(channel * cover + backdrop[index] * (1 - cover)));
}

function write(file, image) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, image);
}

for (const [shop, letter] of [
  ["amarpin", "A"],
  ["uniqbd", "U"],
]) {
  const dir = join(root, shop);
  write(
    join(dir, "icon.png"),
    png(1024, 1024, (x, y, width, height) => paintMark(x, y, width, letter, ink)),
  );
  write(
    join(dir, "splash-icon.png"),
    png(1024, 1024, (x, y, width, height) => paintMark(x, y, width, letter, clear)),
  );
}
