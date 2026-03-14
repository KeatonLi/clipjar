const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');

const pngPath = 'src-tauri/icons/favicon-256.png';
const icoPath = 'src-tauri/icons/favicon.ico';

async function convert() {
  try {
    const buf = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, buf);
    console.log('✅ Generated favicon.ico');
  } catch (e) {
    console.log('Trying alternative method...');
    const { default: pngToIcoAlt } = await import('png-to-ico');
    const buf = await pngToIcoAlt(pngPath);
    fs.writeFileSync(icoPath, buf);
    console.log('✅ Generated favicon.ico');
  }
}

convert();
