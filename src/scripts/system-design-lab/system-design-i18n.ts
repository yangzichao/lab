export const systemDesignLocales = ['zh', 'en'] as const;

export type SystemDesignLocale = (typeof systemDesignLocales)[number];

export const defaultSystemDesignLocale: SystemDesignLocale = 'zh';

export function normalizeSystemDesignLocale(locale: string | undefined): SystemDesignLocale {
  return locale === 'en' ? 'en' : defaultSystemDesignLocale;
}

export function getSystemDesignLocaleLabel(locale: SystemDesignLocale): string {
  return locale === 'en' ? 'English' : '中文';
}

export function getAlternateSystemDesignLocale(
  locale: SystemDesignLocale,
): SystemDesignLocale {
  return locale === 'en' ? 'zh' : 'en';
}

export function getLocalizedSystemDesignPath(
  slug: string,
  locale: SystemDesignLocale,
): string {
  return locale === 'en' ? `/en/system-design/${slug}/` : `/system-design/${slug}/`;
}
