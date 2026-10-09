import { getCollection } from 'astro:content';
import { SECTIONS } from '../sections';

export type SectionEntry = {
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  tags: string[];
  link?: string;
  href: string;
};

const byDateDesc = (a: any, b: any) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** 读取某个板块的全部已发布条目 */
export async function getSectionEntries(sectionSlug: string): Promise<SectionEntry[]> {
  const entries = await getCollection(sectionSlug as any, ({ data }) => !data.draft);
  return entries.sort(byDateDesc).map((entry: any) => ({
    slug: entry.id,
    title: entry.data.title,
    description: entry.data.description || '',
    pubDate: entry.data.pubDate,
    tags: entry.data.tags || [],
    link: entry.data.link,
    href: `/${sectionSlug}/${entry.id}/`,
  }));
}

/** 所有板块的概况（计数 + 最近条目），供侧边栏和首页使用 */
export async function getOverview() {
  const sections = await Promise.all(
    SECTIONS.map(async (s) => {
      const entries = await getSectionEntries(s.slug);
      return { ...s, count: entries.length, latest: entries.slice(0, 5) };
    })
  );
  return sections;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}
