const { app, BrowserWindow } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const ICON_SIZES = [256, 128, 64, 48, 32, 24, 16];
const rootDirectory = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDirectory, 'assets', 'frameshot-mark.svg');
const outputPath = path.join(rootDirectory, 'assets', 'frameshot.ico');

function encodeIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize + entrySize * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = header.length;
  images.forEach(({ size, png }, index) => {
    const entryOffset = headerSize + entrySize * index;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function generateIcon() {
  const source = await readFile(sourcePath, 'utf8');
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: true,
    },
  });

  try {
    const html = `<!doctype html>
      <meta charset="utf-8">
      <style>
        html, body { width: 512px; height: 512px; margin: 0; overflow: hidden; background: transparent; }
        svg { display: block; width: 512px; height: 512px; }
      </style>
      ${source}`;
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    await window.webContents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );

    const captured = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: 512,
      height: 512,
    });
    const images = ICON_SIZES.map((size) => ({
      size,
      png: captured
        .resize({ width: size, height: size, quality: 'best' })
        .toPNG(),
    }));
    await writeFile(outputPath, encodeIco(images));
    console.log(`Generated Windows icon: ${outputPath}`);
  } finally {
    window.destroy();
  }
}

app.commandLine.appendSwitch('disable-gpu');
app
  .whenReady()
  .then(generateIcon)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
