// A tiny requestAnimationFrame loop wrapper. Each lab owns one of these and
// feeds it a per-frame step that receives a clamped delta in seconds, so the
// physics stays stable even when the tab drops frames or comes back from idle.

export type AnimationLoop = {
  start: () => void;
  stop: () => void;
  readonly running: boolean;
};

const maximumFrameSeconds = 1 / 20;
const fallbackFrameSeconds = 1 / 60;

export function createAnimationLoop(step: (deltaSeconds: number) => void): AnimationLoop {
  let running = false;
  let animationFrameId: number | null = null;
  let lastTimestamp = 0;

  const frame = (timestamp: number): void => {
    if (!running) {
      animationFrameId = null;
      return;
    }

    const deltaSeconds =
      lastTimestamp === 0
        ? fallbackFrameSeconds
        : Math.min((timestamp - lastTimestamp) / 1000, maximumFrameSeconds);
    lastTimestamp = timestamp;
    step(deltaSeconds);
    animationFrameId = window.requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (running) {
      return;
    }
    running = true;
    lastTimestamp = 0;
    animationFrameId = window.requestAnimationFrame(frame);
  };

  const stop = (): void => {
    running = false;
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  return {
    start,
    stop,
    get running(): boolean {
      return running;
    },
  };
}
