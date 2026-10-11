export const contentModuleMeta = {
  name: 'content',
  owns: [
    'page',
    'page_translation',
    'article',
    'article_translation',
    'faq_item',
    'faq_item_translation',
  ],
  permissions: ['content:read', 'content:write', 'content:publish'],
} as const;
