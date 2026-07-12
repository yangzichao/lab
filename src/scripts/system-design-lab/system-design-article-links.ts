const articleOrigin = 'https://zichaoyang.com';

const articleSlugOverrides: Record<string, string> = {
  'ad-tracking': 'ad-click-impression-tracking',
  'leetcode-online-judge': 'leetcode-online-judge',
  'online-judge': 'leetcode-online-judge',
};

export function getSystemDesignArticleHref(
  labId: string,
  configuredHref?: string,
): string {
  if (configuredHref?.startsWith('https://') || configuredHref?.startsWith('http://')) {
    return configuredHref;
  }

  if (configuredHref?.startsWith('/')) {
    return `${articleOrigin}${configuredHref}`;
  }

  const articleSlug = articleSlugOverrides[labId] ?? labId;
  return `${articleOrigin}/blog/system-design/${articleSlug}/`;
}
