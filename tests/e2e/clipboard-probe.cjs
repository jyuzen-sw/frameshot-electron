const fs = require('node:fs');
const { app, clipboard } = require('electron');

app.commandLine.appendSwitch('disable-gpu');

const outputPath = process.argv.at(-1);
if (!outputPath || outputPath.endsWith('clipboard-probe.cjs')) {
  fs.writeSync(2, 'Clipboard probe output path is required.\n');
  process.exit(2);
}

app
  .whenReady()
  .then(() => {
    const image = clipboard.readImage('clipboard');
    if (image.isEmpty()) {
      throw new Error('The OS clipboard does not contain an image.');
    }
    const size = image.getSize();
    fs.writeFileSync(outputPath, image.toPNG());
    fs.writeSync(
      1,
      `FRAMESHOT_CLIPBOARD_PROBE:${JSON.stringify({
        width: size.width,
        height: size.height,
      })}\n`,
    );
    app.exit(0);
  })
  .catch((error) => {
    fs.writeSync(
      2,
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    app.exit(1);
  });
