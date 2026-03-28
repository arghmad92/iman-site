import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';

const BLOG_DIR = 'src/content/blog';
const DELAY = 2000;
const YEARS = ['2023', '2024', '2022', '2021', '2020', '2019', '2018', '2017'];

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
turndown.remove(['script', 'style', 'iframe', 'ins', 'noscript', 'nav']);

turndown.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    let src = node.getAttribute('src') || '';
    if (!src || src.includes('data:image') || src.includes('1x1')) return '';
    const wbMatch = src.match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
    if (wbMatch) src = wbMatch[1];
    if (!src.startsWith('http')) return '';
    return `![](${src})\n\n`;
  },
});

turndown.addRule('links', {
  filter: 'a',
  replacement: (content, node) => {
    let href = node.getAttribute('href') || '';
    const wbMatch = href.match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
    if (wbMatch) href = wbMatch[1];
    if (!content.trim()) return '';
    return `[${content}](${href})`;
  },
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractContent(html) {
  const start = html.indexOf('post-body entry-content');
  if (start === -1) return null;
  const tagStart = html.lastIndexOf('<div', start);
  const afterTag = html.indexOf('>', tagStart) + 1;
  const endMarkers = ['class="post-footer', 'id="comments"', 'class="blog-pager"', 'class="post-share'];
  let endIdx = html.length;
  for (const m of endMarkers) {
    const idx = html.indexOf(m, afterTag);
    if (idx > -1 && idx < endIdx) endIdx = idx;
  }
  if (endIdx <= afterTag) return null;
  const chunk = html.substring(afterTag, endIdx);
  const lastDiv = chunk.lastIndexOf('</div>');
  return lastDiv > -1 ? chunk.substring(0, lastDiv) : chunk;
}

function extractFirstImage(html) {
  const match = html.match(/<img[^>]*src="([^"]*(?:blogger|googleusercontent|bp\.blogspot)[^"]*)"/i);
  if (!match) return null;
  let src = match[1];
  const wb = src.match(/web\.archive\.org\/web\/[^\/]+\/(.*)/);
  return wb ? wb[1] : src;
}

async function scrapePost(url) {
  for (const year of YEARS) {
    const wbUrl = `https://web.archive.org/web/${year}/${url}`;
    try {
      const res = await fetch(wbUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const bodyHtml = extractContent(html);
      if (!bodyHtml || bodyHtml.length < 100) continue;

      const image = extractFirstImage(bodyHtml);
      let md = turndown.turndown(bodyHtml).trim()
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/^\[!\s*$/gm, '')
        .replace(/^\[\s*$/gm, '')
        .trim();

      if (md.length < 30) continue;
      return { content: md, image, year };
    } catch { continue; }
  }
  return { content: null, image: null, year: null };
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

    const { content, image, year } = await scrapePost(url);

    if (content) {
      let updatedFm = fm;
      if (image && !fm.includes('\nimage:')) {
        updatedFm = updatedFm.replace(/\nexternalUrl:/, `\nimage: "${image}"\nexternalUrl:`);
      }
      // Remove externalUrl since we have content now
      updatedFm = updatedFm.replace(/\nexternalUrl:.*/, '');
      fs.writeFileSync(filePath, `---\n${updatedFm}\n---\n\n${content}\n`);
      scraped++;
      console.log(`✓ ${content.length} chars (${year})`);
    } else {
      failed++;
      console.log('✗ failed');
    }
    await sleep(DELAY);
  }

  console.log(`\n=== DONE ===\nScraped: ${scraped} | Failed: ${failed} | Skipped: ${skipped}`);
}

main();
