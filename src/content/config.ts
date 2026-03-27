import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string(),
    category: z.enum(['Skincare', 'Beauty', 'Motherhood', 'Parenting', 'Lifestyle']),
    excerpt: z.string(),
    image: z.string().optional(),
    readTime: z.string().default('3 min read'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
