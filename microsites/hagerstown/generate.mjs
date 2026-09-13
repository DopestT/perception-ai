import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pages, site } from './site.config.mjs';

const out = new URL('./dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const canonical = (path) => `${site.domain}${path === '/' ? '' : path}`;

function nav() {
  return site.nav.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join('');
}

function form() {
  return `<form class="lead-form" method="post" action="/api/lead">
    <div class="grid"><label>Name<input name="name" autocomplete="name" required></label><label>Phone<input name="phone" type="tel" autocomplete="tel" required></label></div>
    <div class="grid"><label>Email<input name="email" type="email" autocomplete="email"></label><label>ZIP code<input name="zip" inputmode="numeric" autocomplete="postal-code" required></label></div>
    <label>What are you seeing?<textarea name="issue" rows="5" placeholder="Water after heavy rain, damp crawl space, sump pump issue..." required></textarea></label>
    <input type="hidden" name="source" value="hagerstownbasementwaterproofing.com">
    <button type="submit">Request a local estimate</button>
    <p class="fine">Submitting does not guarantee contractor availability. Your request may be shared with a participating service provider for the purpose of responding to your inquiry.</p>
  </form>`;
}

function html(page) {
  const url = canonical(page.path);
  const isHome = page.path === '/';
  const bullets = page.bullets.map((item) => `<li>${esc(item)}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}"><link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.description, url, isPartOf: { '@type': 'WebSite', name: site.name, url: site.domain } })}</script>
</head><body>
<header><div class="wrap top"><a class="brand" href="/">HAGERSTOWN <span>BASEMENT WATERPROOFING</span></a><nav>${nav()}</nav><a class="cta small" href="/contact">Get an estimate</a></div></header>
<main>
<section class="hero"><div class="wrap hero-grid"><div><p class="eyebrow">HAGERSTOWN · WASHINGTON COUNTY</p><h1>${esc(page.h1)}</h1><p class="lede">${esc(page.intro)}</p><div class="actions"><a class="cta" href="#estimate">Request an estimate</a>${isHome ? '<a class="ghost" href="/basement-waterproofing">Explore solutions</a>' : '<a class="ghost" href="/">Back to overview</a>'}</div></div><aside><p class="aside-title">Common needs</p><ul>${bullets}</ul></aside></div></section>
<section class="content"><div class="wrap content-grid"><article><h2>Start with the source of the moisture</h2><p>Waterproofing is not one product. The useful first step is identifying how water or humidity is reaching the space, then comparing the least disruptive solution that addresses that cause.</p><h2>What to document before an estimate</h2><p>Note where moisture appears, whether it follows rain, how long it remains, whether a sump pump is present, and any recent drainage or foundation changes. Photos can help a contractor understand the pattern before arrival.</p><h2>Local coverage</h2><p>Requests are accepted for Hagerstown and nearby communities including Halfway, Funkstown, Smithsburg, Boonsboro, and Williamsport. Contractor availability varies by location and project type.</p></article><aside class="note"><strong>Independent referral resource</strong><p>${esc(site.disclosure)}</p></aside></div></section>
<section id="estimate" class="estimate"><div class="wrap estimate-grid"><div><p class="eyebrow">NEXT STEP</p><h2>Describe the problem.</h2><p>We use the information you provide to determine whether a participating local provider may be a fit.</p></div>${form()}</div></section>
</main>
<footer><div class="wrap footer-grid"><div><strong>${esc(site.name)}</strong><p>${esc(site.disclosure)}</p></div><div><a href="/faq">FAQ</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a></div></div></footer>
</body></html>`;
}

const extraPages = [
  { path: '/privacy', title: 'Privacy | Hagerstown Basement Waterproofing', description: 'Privacy information for Hagerstown Basement Waterproofing.', h1: 'Privacy', intro: 'Information submitted through this site is used to respond to your request and may be shared with a participating service provider for that purpose.', bullets: ['Contact information', 'Project details', 'Referral routing', 'No sale of fabricated identity data'] },
];

for (const page of [...pages, ...extraPages]) {
  const dir = page.path === '/' ? out : new URL(`.${page.path}/`, out);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html(page), 'utf8');
}

const sitemap = [...pages, ...extraPages].map((page) => `<url><loc>${canonical(page.path)}</loc></url>`).join('');
await writeFile(new URL('sitemap.xml', out), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap}</urlset>`);
await writeFile(new URL('robots.txt', out), `User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`);

const css = `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#14201f;background:#f6f5ef;line-height:1.5}*{box-sizing:border-box}body{margin:0}a{color:inherit}.wrap{width:min(1120px,calc(100% - 40px));margin:auto}header{position:sticky;top:0;z-index:10;background:rgba(246,245,239,.95);border-bottom:1px solid #d7d5ca;backdrop-filter:blur(12px)}.top{min-height:72px;display:flex;align-items:center;gap:28px}.brand{text-decoration:none;font-weight:900;letter-spacing:.04em}.brand span{display:block;font-size:.68rem;font-weight:700;letter-spacing:.12em;color:#62706d}nav{display:flex;gap:18px;margin-left:auto}nav a,footer a{text-decoration:none;font-size:.9rem}.cta{display:inline-block;background:#153f37;color:white;padding:14px 20px;border-radius:5px;text-decoration:none;font-weight:800;border:0;cursor:pointer}.cta.small{padding:10px 14px}.ghost{display:inline-block;padding:13px 18px;border:1px solid #9ca7a3;border-radius:5px;text-decoration:none;font-weight:700}.hero{padding:90px 0 70px;background:linear-gradient(135deg,#eef1e8,#dfe7df)}.hero-grid,.estimate-grid,.content-grid,.footer-grid{display:grid;grid-template-columns:1.3fr .7fr;gap:56px}.eyebrow{font-weight:900;letter-spacing:.15em;font-size:.75rem;color:#506f67}h1{font-size:clamp(2.7rem,6vw,5.4rem);line-height:.96;letter-spacing:-.055em;margin:.25em 0}.lede{font-size:1.2rem;max-width:720px;color:#45514f}.actions{display:flex;gap:12px;margin-top:28px}.hero aside,.note{background:white;border:1px solid #d4dcd6;border-radius:10px;padding:28px;box-shadow:0 14px 40px rgba(32,52,48,.08)}.aside-title{font-weight:900}.hero li{margin:12px 0}.content{padding:72px 0}.content article h2{font-size:2rem;margin:1.5em 0 .4em}.content article p{font-size:1.05rem;color:#46524f}.note{align-self:start}.estimate{background:#112d28;color:#fff;padding:72px 0}.lead-form{background:#fff;color:#14201f;padding:28px;border-radius:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:block;font-size:.85rem;font-weight:800;margin-bottom:14px}input,textarea{width:100%;margin-top:6px;padding:12px;border:1px solid #bdc7c4;border-radius:5px;font:inherit}.lead-form button{width:100%;background:#c8ff73;color:#10201d;border:0;border-radius:5px;padding:14px;font-weight:900}.fine{font-size:.72rem;color:#68736f}footer{padding:36px 0;background:#0a1c19;color:#dce7e3}.footer-grid>div:last-child{display:flex;gap:18px;justify-content:flex-end}@media(max-width:800px){nav{display:none}.hero-grid,.estimate-grid,.content-grid,.footer-grid{grid-template-columns:1fr}.hero{padding-top:54px}.grid{grid-template-columns:1fr}.cta.small{margin-left:auto}h1{font-size:3.2rem}.footer-grid>div:last-child{justify-content:flex-start;flex-wrap:wrap}}`;
await writeFile(new URL('styles.css', out), css, 'utf8');
console.log(`Generated ${pages.length + extraPages.length} indexable pages for ${site.domain}`);
