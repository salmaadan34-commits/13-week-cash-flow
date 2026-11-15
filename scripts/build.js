// Bundles src/ into one self-contained HTML file: dist/index.html.
// Usage: node scripts/build.js            (full HTML document)
//        node scripts/build.js --fragment  (no doctype/html/body wrapper, for hosts that add their own)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fragment = process.argv.includes('--fragment');

const head = `<title>Halden 13-Week Cash Forecast</title>
<meta name="description" content="Direct-method 13-week cash flow forecast with scenarios, revolver logic and forecast-vs-actual roll-forward. Synthetic data.">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500..700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
<style>
${read('src/styles.css')}
</style>`;
const body = `${read('src/body.html')}
<script>
${read('src/engine.js')}
</script>
<script>
${read('src/app.js')}
</script>`;

const out = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const target = process.argv.find((a) => a.startsWith('--out='));
const file = target ? target.slice(6) : path.join(root, 'dist', fragment ? 'fragment.html' : 'index.html');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out);
console.log('Wrote', file, (out.length / 1024).toFixed(1) + ' KB');
