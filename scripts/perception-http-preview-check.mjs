// Offline Perception built-preview HTTP canary. Only fetches 127.0.0.1.
const base = 'http://127.0.0.1:4173';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const get = async (path) => {
  const url = new URL(path, base);
  if (url.hostname !== '127.0.0.1' || url.port !== '4173') {
    throw new Error('Non-local URL rejected: ' + url.href);
  }
  return fetch(url, { signal: AbortSignal.timeout(5000) });
};

let response;
for (let attempt = 0; attempt < 25; attempt += 1) {
  try {
    response = await get('/');
    if (response.ok) break;
  } catch {
    // The preview server may not have started yet.
  }
  await sleep(400);
}
if (!response?.ok) throw new Error('Vite preview did not respond HTTP 200');

const html = await response.text();
if (!/<div id="root"><\/div>/.test(html) || !html.includes('PERCEPTION')) {
  throw new Error('Unexpected HTML or missing root element');
}
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
if (assets.length < 2 || !assets.some((a) => a.endsWith('.js')) || !assets.some((a) => a.endsWith('.css'))) {
  throw new Error('No built JS/CSS assets found in served HTML');
}
const results = [];
for (const asset of assets) {
  const res = await get(asset);
  const body = await res.arrayBuffer();
  if (res.status !== 200 || body.byteLength < 1) {
    throw new Error('Built asset failed: ' + asset + ' (' + res.status + ')');
  }
  results.push({ path: asset, status: res.status, bytes: body.byteLength });
}
console.log(JSON.stringify({
  test: 'perception-built-preview-http-canary',
  status: 'PASS',
  origin: base,
  index_status: response.status,
  assets: results,
  limits: 'HTTP/static asset canary only; does not prove browser interaction or live AI answers'
}));
