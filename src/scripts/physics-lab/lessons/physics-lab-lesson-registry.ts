import type { PhysicsLabLocale } from '../physics-lab-i18n';
import { chargedParticleLesson } from './classical/charged-particle-lesson';
import { coupledOscillatorsLesson } from './classical/coupled-oscillators-lesson';
import { diffractionLesson } from './classical/diffraction-lesson';
import { doublePendulumLesson } from './classical/double-pendulum-lesson';
import { electricFieldLesson } from './classical/electric-field-lesson';
import { fourierEpicyclesLesson } from './classical/fourier-epicycles-lesson';
import { idealGasLesson } from './classical/ideal-gas-lesson';
import { lensOpticsLesson } from './classical/lens-optics-lesson';
import { orbitLesson } from './classical/orbit-lesson';
import { threeBodyLesson } from './classical/three-body-lesson';
import { waveInterferenceLesson } from './classical/wave-interference-lesson';
import type {
  LocalizedPhysicsLabLesson,
  PhysicsLabLesson,
} from './physics-lab-lesson-types';
import { fieldModesLesson } from './quantum/field-modes-lesson';
import { qubitStateLesson } from './quantum/qubit-state-lesson';
import { singleParticleInterferenceLesson } from './quantum/single-particle-interference-lesson';

export type PhysicsLabLessonSuite = 'physics' | 'quantum';

const lessonRegistry: Readonly<
  Record<
    PhysicsLabLessonSuite,
    Readonly<Record<string, LocalizedPhysicsLabLesson>>
  >
> = {
  physics: {
    'charged-particle': chargedParticleLesson,
    'coupled-oscillators': coupledOscillatorsLesson,
    diffraction: diffractionLesson,
    'double-pendulum': doublePendulumLesson,
    'electric-field': electricFieldLesson,
    'fourier-epicycles': fourierEpicyclesLesson,
    'ideal-gas': idealGasLesson,
    'lens-optics': lensOpticsLesson,
    orbit: orbitLesson,
    'three-body': threeBodyLesson,
    'wave-interference': waveInterferenceLesson,
  },
  quantum: {
    'field-modes': fieldModesLesson,
    'qubit-state': qubitStateLesson,
    'single-particle-interference': singleParticleInterferenceLesson,
  },
};

export function getPhysicsLabLesson(
  slug: string,
  locale: PhysicsLabLocale,
  suite: PhysicsLabLessonSuite,
): PhysicsLabLesson | undefined {
  return lessonRegistry[suite][slug]?.[locale];
}
