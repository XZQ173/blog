import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { SECTIONS } from './sections';

// 六个内容板块，每个对应 src/content/<slug>/ 下的 Markdown 文件
const baseSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  link: z.string().optional(), // 分享类内容可以放原文链接
  draft: z.boolean().default(false),
});

export const collections = Object.fromEntries(
  SECTIONS.map((s) => [
    s.slug,
    defineCollection({
      loader: glob({ pattern: '**/*.md', base: `./src/content/${s.slug}` }),
      schema: baseSchema,
    }),
  ])
);

