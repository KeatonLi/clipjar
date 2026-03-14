const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = 'src-tauri/icons/icon.svg';
const outputDir = 'src-tauri/icons';

const sizes = [
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-57.png', size: 57 },
  { name: 'favicon-72.png', size: 72 },
  { name: 'favicon-96.png', size: 96 },
  { name: 'favicon-120.png', size: 120 },
  { name: 'favicon-128.png', size: 128 },
  { name: 'favicon-144.png', size: 144 },
  { name: 'favicon-152.png', size: 152 },
  { name: 'favicon-195.png', size: 195 },
  { name: 'favicon-228.png', size: 228 },
];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  for (const { name, size } of sizes) {
    const outputPath = path.join(outputDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ Generated ${name} (${size}x${size})`);
  }

  // Generate favicon.ico (using 256x256 PNG first, then can be converted)
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(outputDir, 'favicon-256.png'));
  console.log('✅ Generated favicon-256.png');

  console.log('\n🎉 All favicon files generated!');
}

generateIcons().catch(console.error);
