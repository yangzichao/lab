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
  {
    slug: 'electric-field',
    href: '/physics/electric-field/',
    icon: 'ph-lightning',
    title: 'Electric Field',
    eyebrow: 'Fields · electrostatics',
    tagline: 'Place point charges and watch the field take shape around them.',
    description:
      'Drop positive and negative charges on the plane. Streamlines trace the field — leaving positive charges, entering negative ones — and the shaded background is the potential, with equipotential contours drawn where it is level.',
    notice:
      'Field lines never cross, and they always meet equipotentials at right angles. The field is the gradient of the potential, which is why a steep colour change means a strong field. Drag a charge and watch every line reconnect at once.',
  },
  {
    slug: 'fourier-epicycles',
    href: '/physics/fourier-epicycles/',
    icon: 'ph-spiral',
    title: 'Fourier Epicycles',
    eyebrow: 'Fourier series · rotating vectors',
    tagline: 'A chain of spinning circles that draws any shape you give it.',
    description:
      'Each term of a Fourier series is a rotating vector; stack them tip-to-tail and the final tip traces a curve. Add more terms and the wobbly approximation snaps onto the target — a square wave, a sawtooth, a step.',
    notice:
      'The big slow circles carry the overall shape; the small fast ones add the sharp corners. That is the whole idea of a spectrum: any periodic signal is a sum of pure rotations, and the coefficients say how much of each frequency it holds.',
  },
  {
    slug: 'ideal-gas',
    href: '/physics/ideal-gas/',
    icon: 'ph-thermometer-simple',
    title: 'Kinetic Theory',
    eyebrow: 'Thermodynamics · kinetic theory',
    tagline: 'Hundreds of colliding disks, and the order that emerges from chaos.',
    description:
      'A box of hard disks bouncing elastically off each other and the walls. Every collision is effectively random, yet the distribution of their speeds settles onto the Maxwell–Boltzmann curve — and the histogram tracks it live.',
    notice:
      'Temperature is just average kinetic energy. Heat the gas and the whole speed distribution shifts and spreads; the pressure readout is the steady drumbeat of particles striking the walls, which is where PV = NkT comes from.',
  },
  {
    slug: 'coupled-oscillators',
    href: '/physics/coupled-oscillators/',
    icon: 'ph-waveform',
    title: 'Coupled Oscillators',
    eyebrow: 'Mechanics · normal modes',
    tagline: 'A line of masses on springs, and the pure modes hidden inside.',
    description:
      'A chain of masses linked by springs. Any motion, however messy, is a sum of normal modes — patterns where every mass oscillates at one shared frequency. Excite a single mode and it stays pure; mix two and watch beats appear.',
    notice:
      'A system of N masses has exactly N normal modes. The lowest has everything moving together; the highest has neighbours fighting each other. This is the discrete cousin of a vibrating string and the gateway to phonons and band structure.',
  },
  {
    slug: 'diffraction',
    href: '/physics/diffraction/',
    icon: 'ph-circles-three',
    title: 'Diffraction',
    eyebrow: 'Waves · diffraction',
    tagline: 'Send a wave through slits and read the pattern it paints.',
    description:
      'Light through one slit, two slits, or a grating. The intensity on the screen is the interference of every point across the aperture (Huygens), and the curve updates as you widen the slit, add slits, or change the wavelength.',
    notice:
      'Narrow the slit and the pattern spreads — diffraction is the uncertainty principle in disguise. More slits sharpen the bright fringes into thin lines, which is exactly why a diffraction grating can split light into a precise spectrum.',
  },
  {
    slug: 'charged-particle',
    href: '/physics/charged-particle/',
    icon: 'ph-atom',
    title: 'Charged Particle',
    eyebrow: 'Electromagnetism · Lorentz force',
    tagline: 'A charge curving through electric and magnetic fields.',
    description:
      'A charged particle under the Lorentz force F = q(E + v × B). The teal arrow is velocity, the amber arrow is the force. A pure magnetic field bends the path into circles; add an electric field and the circle drifts sideways.',
    notice:
      'The magnetic force is always perpendicular to velocity, so it turns the particle without changing its speed — pure circular motion. Crossed E and B fields produce a steady drift at v = E / B, independent of the charge or the mass.',
  },
  {
    slug: 'three-body',
    href: '/physics/three-body/',
    icon: 'ph-orbit',
    title: 'Three-Body Problem',
    eyebrow: 'Gravity · chaos',
    tagline: 'Three masses pulling on each other, with no closed-form orbit.',
    description:
      'Three bodies under mutual gravity, integrated together. Unlike two bodies there is no general closed-form solution — start from the famous figure-eight choreography, or nudge it and watch the motion tip into chaos.',
    notice:
      'Tiny changes in the start send the system down wildly different paths — sensitive dependence, the signature of chaos. The figure-eight is one of the rare stable periodic solutions; most initial conditions eventually fling one body away.',
  },
  {
    slug: 'lens-optics',
    href: '/physics/lens-optics/',
    icon: 'ph-magnifying-glass',
    title: 'Lenses & Refraction',
    eyebrow: 'Optics · ray tracing',
    tagline: 'Bend rays through a lens and watch the image form.',
    description:
      'Rays from an object refract at a thin lens and converge to an image. Drag the object or change the focal length and the rays retrace in real time — showing real and virtual images, magnification, and the switch from converging to diverging.',
    notice:
      'Three rays fix the image: one through the centre undeviated, one parallel then through the far focus, one through the near focus then parallel. As the object crosses the focal point the image flips from real-and-inverted to virtual-and-upright.',
  },
];

export function findPhysicsLab(slug: string): PhysicsLabEntry | undefined {
  return physicsLabCatalog.find((entry) => entry.slug === slug);
}
