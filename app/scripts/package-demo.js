// Packs the web demo export (npm run build:demo) into one self-contained HTML page for
// publishing as a claude.ai artifact: the JS bundle and its images are inlined, and the router
// is pointed at the home screen whatever path the page is served from.
// Usage: node scripts/package-demo.js [exportDir] [outFile]
const fs = require('fs');
const path = require('path');

const exportDir = path.resolve(process.argv[2] || 'dist-demo');
const outFile = path.resolve(process.argv[3] || path.join(exportDir, 'family-demo.html'));

const jsDir = path.join(exportDir, '_expo/static/js/web');
const entry = fs.readdirSync(jsDir).find((f) => f.startsWith('entry-') && f.endsWith('.js'));
if (!entry) throw new Error(`No entry bundle in ${jsDir}`);
let js = fs.readFileSync(path.join(jsDir, entry), 'utf8');

let inlined = 0;
js = js.replace(/uri:"(\/assets\/[^"]+\.png)"/g, (match, rel) => {
  const file = path.join(exportDir, rel);
  if (!fs.existsSync(file)) return match;
  inlined++;
  return `uri:"data:image/png;base64,${fs.readFileSync(file).toString('base64')}"`;
});
js = js.split('</script').join('<\\/script');

const html = `<title>fam.ily</title>
<style>
  :root { --bg: #FBF7F4; color-scheme: light; }
  html, body { height: 100%; }
  body { background: var(--bg); overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>This demo needs JavaScript.</noscript>
<div id="root"></div>
<script>
  // The app's router reads the URL path; start it on the home screen whatever path this page is served at.
  try { history.replaceState(null, "", "/"); } catch (e) {}
</script>
<script>
${js}
</script>
`;
fs.writeFileSync(outFile, html);
console.log(`Wrote ${outFile} (${(html.length / 1e6).toFixed(2)} MB, ${inlined} images inlined)`);
