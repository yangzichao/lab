import '../../../styles/physics-lab/ligo-lab.css';
import { createAnimationLoop } from '../shared/animation-loop';
import {
  bindAction,
  bindPresets,
  setReadout,
  updatePlayPauseButton,
} from '../shared/dom-controls';
import { normalizePhysicsLabLocale } from '../physics-lab-i18n';
import { getLigoSceneCopy } from './ligo-copy';
import { isLigoSceneId, ligoSceneIds, type LigoSceneId } from './ligo-scene-types';
import { LigoThreeDimensionalRenderer } from './ligo-three-dimensional-renderer';

const secondsPerScene = 11;

type NarrativeOverlay = {
  root: HTMLElement;
  number: HTMLElement;
  eyebrow: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  progress: HTMLElement;
};

function createNarrativeOverlay(stage: HTMLElement): NarrativeOverlay {
  const root = document.createElement('section');
  root.className = 'ligo-stage-copy';
  root.setAttribute('aria-live', 'polite');

  const number = document.createElement('span');
  number.className = 'ligo-stage-copy__number';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'ligo-stage-copy__eyebrow';
  const title = document.createElement('h2');
  title.className = 'ligo-stage-copy__title';
  const description = document.createElement('p');
  description.className = 'ligo-stage-copy__description';
  const progressTrack = document.createElement('span');
  progressTrack.className = 'ligo-stage-copy__progress-track';
  const progress = document.createElement('span');
  progress.className = 'ligo-stage-copy__progress';
  progressTrack.append(progress);
  root.append(number, eyebrow, title, description, progressTrack);
  stage.append(root);
  return { root, number, eyebrow, title, description, progress };
}

export function initLigoLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="ligo-interferometer"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  const stage = canvas?.closest<HTMLElement>('.plab__stage');
  if (!root || !canvas || !stage) {
    return;
  }

  const locale = normalizePhysicsLabLocale(root.dataset.locale);
  const renderer = new LigoThreeDimensionalRenderer(canvas);
  const overlay = createNarrativeOverlay(stage);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeSceneId: LigoSceneId = 'spacetime';
  let simulationElapsedSeconds = 0;
  let sceneElapsedSeconds = 0;

  const markActiveSceneButton = (): void => {
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
      const isActive = button.dataset.preset === activeSceneId;
      button.setAttribute('aria-pressed', String(isActive));
    });
  };

  const updateSceneCopy = (): void => {
    const copy = getLigoSceneCopy(locale, activeSceneId);
    overlay.root.classList.remove('is-changing');
    overlay.number.textContent = copy.number;
    overlay.eyebrow.textContent = copy.eyebrow;
    overlay.title.textContent = copy.title;
    overlay.description.textContent = copy.description;
    setReadout(root, 'scene', `${Number(copy.number.slice(0, 2))} · ${copy.title}`);
    setReadout(root, 'measurement', copy.measurement);
    setReadout(root, 'signal', copy.signal);
    markActiveSceneButton();
  };

  const selectScene = (sceneId: LigoSceneId, animate: boolean): void => {
    if (sceneId === activeSceneId) {
      sceneElapsedSeconds = 0;
      return;
    }
    overlay.root.classList.add('is-changing');
    activeSceneId = sceneId;
    sceneElapsedSeconds = 0;
    renderer.setScene(sceneId, animate);
    window.setTimeout(updateSceneCopy, prefersReducedMotion ? 0 : 170);
  };

  const advanceScene = (): void => {
    const currentIndex = ligoSceneIds.indexOf(activeSceneId);
    const nextSceneId = ligoSceneIds[(currentIndex + 1) % ligoSceneIds.length] ?? 'spacetime';
    selectScene(nextSceneId, true);
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    simulationElapsedSeconds += deltaSeconds;
    sceneElapsedSeconds += deltaSeconds;
    if (sceneElapsedSeconds >= secondsPerScene) {
      advanceScene();
    }
    overlay.progress.style.transform = `scaleX(${Math.min(1, sceneElapsedSeconds / secondsPerScene)})`;
    renderer.draw(simulationElapsedSeconds, deltaSeconds);
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) {
      loop.stop();
    } else {
      loop.start();
    }
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    simulationElapsedSeconds = 0;
    sceneElapsedSeconds = 0;
    selectScene('spacetime', false);
    renderer.renderStatic(0);
  });
  bindPresets(root, (presetId) => {
    if (!isLigoSceneId(presetId)) {
      return;
    }
    selectScene(presetId, loop.running);
    if (!loop.running) {
      renderer.renderStatic(simulationElapsedSeconds);
    }
  });

  updateSceneCopy();
  renderer.renderStatic(0);
  if (!prefersReducedMotion) {
    loop.start();
  }
  updatePlayPauseButton(root, loop.running);

  window.addEventListener(
    'pagehide',
    () => {
      loop.stop();
      renderer.dispose();
      overlay.root.remove();
    },
    { once: true },
  );
}
