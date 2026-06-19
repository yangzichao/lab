// Single source of truth for the physics labs. Each simulation is now its own
// page; adding a new one is: write its module, then add an entry here. The root
// index and every lab header read from this list, so titles, taglines, and the
// teaching note never drift apart.

export type PhysicsLabEntry = {
  slug: string;
  href: string;
  icon: string;
  title: string;
  eyebrow: string;
  tagline: string;
  description: string;
  notice: string;
};

export const physicsLabCatalog: PhysicsLabEntry[] = [
  {
    slug: 'double-pendulum',
    href: '/physics/double-pendulum/',
    icon: 'ph-infinity',
    title: 'Double Pendulum',
    eyebrow: 'Chaos · nonlinear dynamics',
    tagline: 'Two coupled rods whose motion is famously unpredictable.',
    description:
      'A double pendulum integrated with RK4. A faint twin starts a thousandth of a degree away — watch how long it stays in step before chaos pulls the two apart.',
    notice:
      'With damping at zero, total energy holds steady — that flat number is the integrator proving it conserves energy. Nudge a starting angle and the twin reveals sensitive dependence on initial conditions.',
  },
  {
    slug: 'orbit',
    href: '/physics/orbit/',
    icon: 'ph-planet',
    title: 'Orbit Lab',
    eyebrow: 'Gravity · central forces',
    tagline: 'Launch a body and watch the conic section it traces.',
    description:
      'A body under an inverse-square pull. The teal arrow is velocity, the amber arrow is gravity — always pointing at the star — and the faint ellipse is the orbit the current state predicts.',
    notice:
      'Specific energy decides the shape: negative is a bound ellipse, zero is a parabola, positive escapes on a hyperbola. Angular momentum stays fixed, which is why the body sweeps equal areas in equal times.',
  },
  {
    slug: 'wave-interference',
    href: '/physics/wave-interference/',
    icon: 'ph-wave-sine',
    title: 'Wave Interference',
    eyebrow: 'Waves · superposition',
    tagline: 'Two coherent sources, and the fringes where they meet.',
    description:
      'Two point sources emit in step. Where their path difference is a whole number of wavelengths they reinforce; a half-wavelength out, they cancel. The strip on the right is the intensity you would measure on a screen.',
    notice:
      'Drag on the canvas to move the probe. Bright fringes sit where the path difference is 0, λ, 2λ…; widening the source gap squeezes the fringes together, exactly as in a double-slit experiment.',
  },
];

export function findPhysicsLab(slug: string): PhysicsLabEntry | undefined {
  return physicsLabCatalog.find((entry) => entry.slug === slug);
}
