import type { BeachShow, ClamProfile, SpeciesId } from './geoduck-dig-types';
import { SPECIES_WEIGHTS } from './geoduck-dig-config';

function pickSpecies(): SpeciesId {
  const roll = Math.random();
  let cumulative = 0;
  for (const species of Object.keys(SPECIES_WEIGHTS) as SpeciesId[]) {
    cumulative += SPECIES_WEIGHTS[species];
    if (roll <= cumulative) {
      return species;
    }
  }
  return 'geoduck';
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function buildClam(species: SpeciesId): ClamProfile {
  switch (species) {
    case 'geoduck':
      return {
        species,
        label: 'Geoduck',
        bodyDepthFt: randomInRange(2.3, 3.1),
        weightLb: randomInRange(1.6, 3.4),
        neckShape: 'oval',
        siphonHoles: 2,
        tip: 'bare',
        squirt: 'strong',
      };
    case 'horse-clam':
      return {
        species,
        label: 'Horse clam',
        bodyDepthFt: randomInRange(1.1, 1.8),
        weightLb: randomInRange(0.8, 1.6),
        neckShape: 'round',
        siphonHoles: 1,
        tip: 'leathery',
        squirt: 'weak',
      };
    case 'cockle':
      return {
        species,
        label: 'Cockle',
        bodyDepthFt: randomInRange(0.25, 0.6),
        weightLb: randomInRange(0.1, 0.35),
        neckShape: 'short',
        siphonHoles: 2,
        tip: 'bare',
        squirt: 'none',
      };
  }
}

/** Lay out a fresh patch of shows across the tidal flat. */
export function generateShows(count: number): BeachShow[] {
  const shows: BeachShow[] = [];
  for (let index = 0; index < count; index += 1) {
    // Spread shows over a loose grid so they never overlap on the flat.
    const column = index % 3;
    const row = Math.floor(index / 3);
    shows.push({
      id: index,
      x: 0.18 + column * 0.32 + randomInRange(-0.05, 0.05),
      y: 0.32 + row * 0.34 + randomInRange(-0.05, 0.05),
      clam: buildClam(pickSpecies()),
      inspected: false,
    });
  }
  return shows;
}

export interface IdentificationClue {
  label: string;
  value: string;
  /** True when this reading points toward a true geoduck. */
  goodSign: boolean;
}

/** The field clues a digger reads off a show before committing to dig it. */
export function readClues(clam: ClamProfile): IdentificationClue[] {
  const neckShapeText =
    clam.neckShape === 'oval'
      ? 'Oval, flattened'
      : clam.neckShape === 'round'
        ? 'Round, fat'
        : 'Stubby, barely showing';

  return [
    {
      label: 'Neck shape',
      value: neckShapeText,
      goodSign: clam.neckShape === 'oval',
    },
    {
      label: 'Siphon holes',
      value: clam.siphonHoles === 2 ? 'Two clear holes' : 'One opening',
      goodSign: clam.siphonHoles === 2 && clam.neckShape !== 'short',
    },
    {
      label: 'Siphon tip',
      value: clam.tip === 'bare' ? 'Bare, smooth' : 'Leathery sheath',
      goodSign: clam.tip === 'bare' && clam.neckShape !== 'short',
    },
    {
      label: 'Squirt when stomped',
      value:
        clam.squirt === 'strong'
          ? 'Strong jet of water'
          : clam.squirt === 'weak'
            ? 'A weak dribble'
            : 'Nothing',
      goodSign: clam.squirt === 'strong',
    },
  ];
}

/** Best-guess label a digger would call out loud after inspecting. */
export function fieldGuess(clam: ClamProfile): string {
  if (clam.species === 'geoduck') {
    return 'Looks like the real thing — oval neck, two holes, strong squirt.';
  }
  if (clam.species === 'horse-clam') {
    return 'Round neck and a leathery tip — almost certainly a horse clam.';
  }
  return 'Barely under the surface with a stubby show — just a cockle.';
}
