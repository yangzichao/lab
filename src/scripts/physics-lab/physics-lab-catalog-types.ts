import type { PhysicsLabLocale } from './physics-lab-i18n';

export type LocalizedPhysicsLabText = {
  title: string;
  eyebrow: string;
  tagline: string;
  description: string;
  notice: string;
};

export type PhysicsLabDefinition = {
  slug: string;
  icon: string;
  text: Record<PhysicsLabLocale, LocalizedPhysicsLabText>;
};

export type PhysicsLabEntry = LocalizedPhysicsLabText & {
  slug: string;
  href: string;
  icon: string;
  locale: PhysicsLabLocale;
};
