// 六大板块定义 —— 全站导航、首页知识地图、栏目页都从这里取
export const SECTIONS = [
  {
    slug: 'posts',
    label: '个人文章',
    emoji: '✍️',
    description: '我自己写的思考、记录与复盘。',
  },
  {
    slug: 'reading',
    label: '文章分享',
    emoji: '📖',
    description: '我读到的觉得好的文章，附上原文链接与我的分析。',
  },
  {
    slug: 'baguwen',
    label: '八股总结',
    emoji: '🧱',
    description: '面试常见八股知识点，系统整理、集中复习。',
  },
  {
    slug: 'interview',
    label: '面试汇总',
    emoji: '🎯',
    description: '面经与面试复盘：流程、题目、考点与延伸知识。',
  },
  {
    slug: 'projects',
    label: '个人项目',
    emoji: '🛠️',
    description: '我做过的项目：背景、方案、踩坑与收获。',
  },
  {
    slug: 'showcases',
    label: '项目分享',
    emoji: '🔭',
    description: '值得学习的开源项目与外部项目拆解、分析。',
  },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]['slug'];

export const SECTION_MAP: Record<
  string,
  { slug: string; label: string; emoji: string; description: string }
> = Object.fromEntries(SECTIONS.map((s) => [s.slug, { ...s }]));
