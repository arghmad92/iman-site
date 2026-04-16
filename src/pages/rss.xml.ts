import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const sorted = posts.sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  return rss({
    title: 'Iman Abdul Rahim',
    description: 'Beauty, parenting & lifestyle blog — honest stories from Malaysia.',
    site: context.site!,
    items: sorted.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.date),
      description: post.data.excerpt,
      link: `/posts/${post.id}/`,
    })),
    customData: `<language>en-my</language>`,
  });
}
