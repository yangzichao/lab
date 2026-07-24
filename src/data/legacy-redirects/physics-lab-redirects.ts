const sandboxPhysicsBaseUrl = 'https://sandboxphysics.com';

const legacyClassicalPhysicsSlugs = [
  'double-pendulum',
  'orbit',
  'wave-interference',
  'electric-field',
  'fourier-epicycles',
  'ideal-gas',
  'coupled-oscillators',
  'diffraction',
  'charged-particle',
  'three-body',
  'lens-optics',
  'ligo-interferometer',
  'magnus-effect',
  'thick-lens-refraction',
  'laser-resonant-cavity',
  'stellar-fusion-chain',
] as const;

const legacyQuantumPhysicsSlugs = [
  'qubit-state',
  'single-particle-interference',
  'field-modes',
] as const;

type LegacyPhysicsLocale = 'zh' | 'en';

function buildSandboxPhysicsPathPrefix(locale: LegacyPhysicsLocale): string {
  return locale === 'en' ? '/en/physics' : '/physics';
}

function createLegacyPhysicsRedirectPaths(
  slugs: readonly string[],
  locale: LegacyPhysicsLocale,
  category?: 'quantum',
) {
  const localizedPathPrefix = buildSandboxPhysicsPathPrefix(locale);
  const categoryPath = category ? `/${category}` : '';

  return slugs.map((slug) => ({
    params: { slug },
    props: {
      destination: `${sandboxPhysicsBaseUrl}${localizedPathPrefix}${categoryPath}/${slug}/`,
    },
  }));
}

export function getLegacyClassicalPhysicsRedirectPaths(locale: LegacyPhysicsLocale) {
  return createLegacyPhysicsRedirectPaths(legacyClassicalPhysicsSlugs, locale);
}

export function getLegacyQuantumPhysicsRedirectPaths(locale: LegacyPhysicsLocale) {
  return createLegacyPhysicsRedirectPaths(legacyQuantumPhysicsSlugs, locale, 'quantum');
}
