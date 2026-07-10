import type { PhysicsLabLocale } from '../physics-lab-i18n';

export function getLocalizedQuantumLabPath(slug: string, locale: PhysicsLabLocale): string {
  return locale === 'en'
    ? `/en/physics/quantum/${slug}/`
    : `/physics/quantum/${slug}/`;
}
