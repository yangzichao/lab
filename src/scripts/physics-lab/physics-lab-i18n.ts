export const physicsLabLocales = ['zh', 'en'] as const;

export type PhysicsLabLocale = (typeof physicsLabLocales)[number];

export const defaultPhysicsLabLocale: PhysicsLabLocale = 'zh';

export function normalizePhysicsLabLocale(locale: string | undefined): PhysicsLabLocale {
  return locale === 'en' ? 'en' : defaultPhysicsLabLocale;
}

export function getAlternatePhysicsLabLocale(locale: PhysicsLabLocale): PhysicsLabLocale {
  return locale === 'en' ? 'zh' : 'en';
}

export function getLocalizedPhysicsLabPath(slug: string, locale: PhysicsLabLocale): string {
  return locale === 'en' ? `/en/physics/${slug}/` : `/physics/${slug}/`;
}

export function getPhysicsLabHtmlLang(locale: PhysicsLabLocale): string {
  return locale === 'en' ? 'en' : 'zh-CN';
}
