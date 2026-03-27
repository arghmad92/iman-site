import fs from 'fs';
import path from 'path';
import TurndownService from 'turndown';

const BLOG_DIR = 'src/content/blog';
const DELAY = 2000;
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.remove(['script', 'style', 'iframe', 'ins', 'noscript', 'nav']);

turndown.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    let src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    if (!src || src.includes('data:image') || src.includes('1x1')) return '';
    // Fix wayback URLs — extract original
    const wbMatch = src.match(/web\.archive\.org\/web\/\d+\/(.*)/);
    if (wbMatch) src = wbMatch[1];
    if (!src.startsWith('http')) return '';
    return `![${alt}](${src})\n\n`;
  },
});

turndown.addRule('links', {
  filter: 'a',
  replacement: (content, node) => {
    let href = node.getAttribute('href') || '';
    const wbMatch = href.match(/web\.archive\.org\/web\/\d+\/(.*)/);
    if (wbMatch) href = wbMatch[1];
    if (!content.trim()) return '';
    return `[${content}](${href})`;
  },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractBloggerContent(html) {
  // Match post-body entry-content
  const re = /<div[^>]*class="[^"]*post-body entry-content[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*post-footer/i;
  let match = html.match(re);
  if (match) return match[1];

  // Fallback: just post-body
  const re2 = /<div[^>]*class="[^"]*post-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class="(?:post-footer|widget|separator)")/i;
  match = html.match(re2);
  if (match) return match[1];

  // More aggressive: everything between post-body and closing tags
  const start = html.indexOf('post-body entry-content');
  if (start > -1) {
    const tagStart = html.lastIndexOf('<div', start);
    const afterTag = html.indexOf('>', tagStart) + 1;
    // Find a reasonable end
    const endMarkers = ['class="post-footer', 'id="comments"', 'class="blog-pager"', 'class="post-share'];
    let endIdx = html.length;
    for (const marker of endMarkers) {
      const idx = html.indexOf(marker, afterTag);
      if (idx > -1 && idx < endIdx) endIdx = idx;
    }
    if (endIdx > afterTag) {
      const chunk = html.substring(afterTag, endIdx);
      // Find last </div> before the end marker
      const lastDiv = chunk.lastIndexOf('</div>');
      return lastDiv > -1 ? chunk.substring(0, lastDiv) : chunk;
    }
  }

  return null;
}

function extractFirstImage(html) {
  const match = html.match(/<img[^>]*src="(https?:\/\/[^"]+(?:blogger|googleusercontent|bp\.blogspot)[^"]*)"[^>]*>/i);
  if (match) {
    const wbMatch = match[1].match(/web\.archive\.org\/web\/\d+\/(.*)/);
    return wbMatch ? wbMatch[1] : match[1];
  }
  return null;
}

async function scrapePost(url) {
  // Use Wayback Machine
  const waybackUrl = `https://web.archive.org/web/2024/${url}`;

  try {
    const res = await fetch(waybackUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return { content: null, image: null };

    const html = await res.text();
    const bodyHtml = extractBloggerContent(html);
    if (!bodyHtml || bodyHtml.length < 50) return { content: null, image: null };

    const image = extractFirstImage(bodyHtml);
    let markdown = turndown.turndown(bodyHtml).trim();

    // Clean up
    markdown = markdown
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/\[?\s*\]?\(https?:\/\/web\.archive\.org[^)]*\)/g, '')
      .trim();

    if (markdown.length < 30) return { content: null, image: null };

    return { content: markdown, image };
  } catch (e) {
    return { content: null, image: null };
  }
}

async function main() {
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
  let scraped = 0;
  let failed = 0;
  let skipped = 0;
  const total = files.length;

  console.log(`Found ${total} markdown files\n`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(BLOG_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf8');

    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) { skipped++; continue; }

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();

    const urlMatch = frontmatter.match(/externalUrl:\s*"([^"]+)"/);
    if (!urlMatch) { skipped++; continue; }

    // Skip if already has scraped content
    if (body.length > 150 && !body.startsWith('This post was originally published')) {
      skipped++;
      continue;
    }

    const externalUrl = urlMatch[1];
    const num = scraped + failed + 1;
    process.stdout.write(`[${num}] ${file.substring(0, 50).padEnd(50)} `);

    const { content, image } = await scrapePost(externalUrl);

    if (content && content.length > 30) {
      let updatedFm = frontmatter;

      // Add image if found
      if (image && !frontmatter.includes('\nimage:')) {
        updatedFm = updatedFm.replace(
          /\nexternalUrl:/,
          `\nimage: "${image}"\nexternalUrl:`
        );
      }

      const newContent = `---\n${updatedFm}\n---\n\n${content}\n`;
      fs.writeFileSync(filePath, newContent);
      scraped++;
      console.log(`✓ ${content.length} chars`);
    } else {
      failed++;
      console.log(`✗ failed`);
    }

    await sleep(DELAY);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Scraped: ${scraped} | Failed: ${failed} | Skipped: ${skipped} | Total: ${total}`);
}

main();
