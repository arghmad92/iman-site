import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';

const BLOG_DIR = 'src/content/blog';
const DELAY = 2500;

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndown.remove(['script', 'style', 'iframe', 'ins', 'noscript', 'nav']);
turndown.addRule('images', {
  filter: 'img',
  replacement: (c, node) => {
    let src = node.getAttribute('src') || '';
    if (!src || src.includes('data:image') || src.includes('1x1')) return '';
    const wb = src.match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
    if (wb) src = wb[1];
    return src.startsWith('http') ? `![](${src})\n\n` : '';
  },
});
turndown.addRule('links', {
  filter: 'a',
  replacement: (content, node) => {
    let href = node.getAttribute('href') || '';
    const wb = href.match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
    if (wb) href = wb[1];
    return content.trim() ? `[${content}](${href})` : '';
  },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractContent(html) {
  const start = html.indexOf('post-body entry-content');
  if (start === -1) return null;
  const tagStart = html.lastIndexOf('<div', start);
  const afterTag = html.indexOf('>', tagStart) + 1;
  const ends = ['class="post-footer', 'id="comments"', 'class="blog-pager"', 'class="post-share'];
  let endIdx = html.length;
  for (const m of ends) { const i = html.indexOf(m, afterTag); if (i > -1 && i < endIdx) endIdx = i; }
  if (endIdx <= afterTag) return null;
  const chunk = html.substring(afterTag, endIdx);
  const last = chunk.lastIndexOf('</div>');
  return last > -1 ? chunk.substring(0, last) : chunk;
}

function extractFirstImage(html) {
  const m = html.match(/<img[^>]*src="([^"]*(?:blogger|googleusercontent|bp\.blogspot)[^"]*)"/i);
  if (!m) return null;
  const wb = m[1].match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
  return wb ? wb[1] : m[1];
}

// Use Wayback availability API to get exact snapshot URL
async function getSnapshotUrl(url) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=20240101`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const snap = data?.archived_snapshots?.closest;
    if (snap?.available) {
      // Check if snapshot is from before domain move (before 2025-03)
      const ts = snap.timestamp;
      if (parseInt(ts) < 20250301000000) return snap.url;
    }
  } catch {}
  return null;
}

async function scrapeExact(wbUrl) {
  try {
    const res = await fetch(wbUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { content: null, image: null };
    const html = await res.text();
    const bodyHtml = extractContent(html);
    if (!bodyHtml || bodyHtml.length < 100) return { content: null, image: null };
    const image = extractFirstImage(bodyHtml);
    let md = turndown.turndown(bodyHtml).trim().replace(/\n{4,}/g, '\n\n\n').replace(/^\[!\s*$/gm, '').replace(/^\[\s*$/gm, '').trim();
    return md.length > 30 ? { content: md, image } : { content: null, image: null };
  } catch { return { content: null, image: null }; }
}

async function main() {
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  let scraped = 0, failed = 0, skipped = 0;

  for (const file of files) {
    const filePath = path.join(BLOG_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) { skipped++; continue; }
    const fm = fmMatch[1];
    const body = fmMatch[2].trim();
    const urlMatch = fm.match(/externalUrl:\s*"([^"]+)"/);
    if (!urlMatch) { skipped++; continue; }
    if (body.length > 150 && !body.startsWith('This post was originally published')) { skipped++; continue; }

    const url = urlMatch[1];
    process.stdout.write(`[${scraped + failed + 1}] ${file.substring(0, 50).padEnd(50)} `);

    const snapUrl = await getSnapshotUrl(url);
    if (!snapUrl) { failed++; console.log('✗ no pre-2025 snapshot'); await sleep(500); continue; }

    const { content, image } = await scrapeExact(snapUrl);
    if (content) {
      let updatedFm = fm;
      if (image && !fm.includes('\nimage:')) updatedFm = updatedFm.replace(/\nexternalUrl:/, `\nimage: "${image}"\nexternalUrl:`);
      updatedFm = updatedFm.replace(/\nexternalUrl:.*/, '');
      fs.writeFileSync(filePath, `---\n${updatedFm}\n---\n\n${content}\n`);
      scraped++;
      console.log(`✓ ${content.length} chars`);
    } else { failed++; console.log('✗ no content'); }
    await sleep(DELAY);
  }

  console.log(`\n=== DONE ===\nScraped: ${scraped} | Failed: ${failed} | Skipped: ${skipped}`);
}

main();
