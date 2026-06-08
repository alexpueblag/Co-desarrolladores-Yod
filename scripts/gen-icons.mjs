// Genera los iconos PNG de la PWA a partir del logo OFICIAL de YoDesarrollo
// (monograma "yd"). El archivo original es blanco-sobre-blanco (JPEG, sin
// transparencia), asi que amplificamos el contraste para extraer la silueta y
// la pintamos en DORADO sobre el fondo OSCURO de marca (igual que el login).
import sharp from 'sharp';

const SRC = '/Users/a./.claude/uploads/ae285e20-5df7-456c-bad9-6a8012dddd10/d5d8d294-Yo_Desarrollo_Logo_Blanco_PNG.jpeg';
const INK = [26, 20, 9];     // #1a1409 fondo de marca
const GOLD = [212, 190, 138]; // #d4be8a dorado de marca

// Construye un buffer RGB (size x size): fondo oscuro + monograma dorado.
async function construir(size, scale) {
  const inner = Math.round(size * scale);
  const { data, info } = await sharp(SRC)
    .greyscale()
    .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
    .raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < out.length; i += 3) { out[i] = INK[0]; out[i + 1] = INK[1]; out[i + 2] = INK[2]; }
  const ox = Math.round((size - W) / 2), oy = Math.round((size - H) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lum = data[y * W + x];
    let a = (250 - lum) * 28; if (a < 0) a = 0; if (a > 255) a = 255;
    if (a < 40) continue; // corta el ruido del fondo
    const t = a / 255;
    const px = ((oy + y) * size + (ox + x)) * 3;
    out[px] = Math.round(INK[0] + (GOLD[0] - INK[0]) * t);
    out[px + 1] = Math.round(INK[1] + (GOLD[1] - INK[1]) * t);
    out[px + 2] = Math.round(INK[2] + (GOLD[2] - INK[2]) * t);
  }
  return { buffer: out, raw: { width: size, height: size, channels: 3 } };
}

async function gen(name, size, { scale, rounded = false } = {}) {
  const { buffer, raw } = await construir(size, scale);
  let img;
  if (rounded) {
    const r = Math.round(size * 0.22);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
    img = sharp(buffer, { raw }).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]);
  } else {
    img = sharp(buffer, { raw });
  }
  await img.png().toFile(`public/${name}`);
  console.log('wrote public/' + name);
}

// Iconos "any": esquinas redondeadas (transparentes) para verse bien en todos lados.
await gen('pwa-192x192.png', 192, { scale: 0.72, rounded: true });
await gen('pwa-512x512.png', 512, { scale: 0.72, rounded: true });
// Maskable: fondo a sangre completa y logo mas chico (zona segura del 80%).
await gen('maskable-512x512.png', 512, { scale: 0.56, rounded: false });
// Apple touch icon: cuadro completo (iOS le pone las esquinas).
await gen('apple-touch-icon.png', 180, { scale: 0.72, rounded: false });
// Favicon (pestania del navegador).
await gen('favicon-32x32.png', 32, { scale: 0.8, rounded: true });
