import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/favicon.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Generate PNG icons
for (const size of sizes) {
  const outputPath = resolve(__dirname, `../public/icons/icon-${size}x${size}.png`);
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`Generated icon-${size}x${size}.png`);
}

// Generate favicon.ico (32x32 PNG wrapped as ICO)
const favicon32 = await sharp(svgBuffer)
  .resize(32, 32)
  .png()
  .toBuffer();

// Simple ICO file format: header + one 32x32 PNG entry
const pngSize = favicon32.length;
const headerSize = 6;
const entrySize = 16;
const dataOffset = headerSize + entrySize;

const ico = Buffer.alloc(dataOffset + pngSize);
// ICO header
ico.writeUInt16LE(0, 0);      // reserved
ico.writeUInt16LE(1, 2);      // type: ICO
ico.writeUInt16LE(1, 4);      // count: 1 image
// ICO directory entry
ico.writeUInt8(32, 6);        // width
ico.writeUInt8(32, 7);        // height
ico.writeUInt8(0, 8);         // color palette
ico.writeUInt8(0, 9);         // reserved
ico.writeUInt16LE(1, 10);     // color planes
ico.writeUInt16LE(32, 12);    // bits per pixel
ico.writeUInt32LE(pngSize, 14); // image data size
ico.writeUInt32LE(dataOffset, 18); // image data offset
// Copy PNG data
favicon32.copy(ico, dataOffset);

writeFileSync(resolve(__dirname, '../public/favicon.ico'), ico);
console.log('Generated favicon.ico');

console.log('Done!');
