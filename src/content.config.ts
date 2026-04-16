import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.string(),
    category: z.enum(['Skincare', 'Beauty', 'Motherhood', 'Parenting', 'Lifestyle']),
    excerpt: z.string(),
    image: z.string().optional(),
    externalUrl: z.string().optional(),
    readTime: z.string().default('3 min read'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
