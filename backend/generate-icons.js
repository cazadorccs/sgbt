// Script para generar iconos PNG válidos de 192x192 y 512x512 para PWA
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function createPng(width, height, drawFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw Image Data (Filter byte 0 + RGBA per pixel per row)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * (rowBytes + 1));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Dibujador del icono con paleta Sea
function drawSeaIcon(x, y, w, h) {
  const nx = x / w;
  const ny = y / h;

  // Distancia radial al centro
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Fondo redondeado oscuro #040d16 -> #002233
  let r = 4 + Math.floor(nx * 10);
  let g = 13 + Math.floor(ny * 25);
  let b = 22 + Math.floor((nx + ny) * 35);
  let a = 255;

  // Esquinas redondeadas
  const cornerR = 0.22;
  const cornerDistX = Math.max(0, Math.abs(dx) - (0.5 - cornerR));
  const cornerDistY = Math.max(0, Math.abs(dy) - (0.5 - cornerR));
  const cornerDist = Math.sqrt(cornerDistX * cornerDistX + cornerDistY * cornerDistY);
  if (cornerDist > cornerR) {
    return [0, 0, 0, 0]; // Transparente fuera del icono
  }

  // Borde cian #0099cc
  if (cornerDist > cornerR - 0.02 || (Math.abs(dx) > 0.47 || Math.abs(dy) > 0.47)) {
    return [0, 153, 204, 255];
  }

  // Resplandor central en Pacific Blue
  if (dist < 0.38) {
    const factor = (0.38 - dist) / 0.38;
    r = Math.min(255, r + Math.floor(0 * factor));
    g = Math.min(255, g + Math.floor(153 * factor * 0.7));
    b = Math.min(255, b + Math.floor(204 * factor * 0.8));
  }

  // Escudo central en forma de diamante / cresta
  const inShield = (Math.abs(dx) * 1.5 + Math.max(0, dy * 1.2)) < 0.35 && dy < 0.32 && dy > -0.32;
  if (inShield) {
    // Gradiente Malibu #66ccff / Pacific Blue #0099cc
    const sy = (dy + 0.32) / 0.64;
    return [
      Math.floor(102 * (1 - sy)),
      Math.floor(204 * (1 - sy * 0.25)),
      Math.floor(255 * (1 - sy * 0.2)),
      255
    ];
  }

  // Caja de entrega en el centro (cuadrado isométrico interior)
  if (Math.abs(dx) < 0.12 && Math.abs(dy + 0.02) < 0.12) {
    return [229, 255, 255, 255]; // Tranquil #e5ffff
  }

  return [r, g, b, a];
}

const outDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 192x192
const png192 = createPng(192, 192, drawSeaIcon);
fs.writeFileSync(path.join(outDir, 'icon-192.png'), png192);
console.log('✅ Generado: public/icons/icon-192.png');

// 512x512
const png512 = createPng(512, 512, drawSeaIcon);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), png512);
console.log('✅ Generado: public/icons/icon-512.png');
