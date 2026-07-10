function dispatchViewportResize(): void {
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export function initPhysicsLabFullscreen(): void {
  const region = document.querySelector<HTMLElement>('[data-fullscreen-region]');
  const toggle = region?.querySelector<HTMLButtonElement>('[data-fullscreen-toggle]');
  if (!region || !toggle || toggle.dataset.fullscreenInitialized === 'true') {
    return;
  }

  toggle.dataset.fullscreenInitialized = 'true';
  const enterLabel = toggle.dataset.enterLabel ?? 'Enter fullscreen';
  const exitLabel = toggle.dataset.exitLabel ?? 'Exit fullscreen';
  const enterText = toggle.querySelector<HTMLElement>('[data-fullscreen-label="enter"]');
  const exitText = toggle.querySelector<HTMLElement>('[data-fullscreen-label="exit"]');
  const icon = toggle.querySelector<HTMLElement>('i');
  const stage = region.querySelector<HTMLElement>('.plab__stage');
  const canvas = stage?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  let fallbackScrollPosition = 0;

  const isNativeFullscreen = (): boolean => document.fullscreenElement === region;
  const isFallbackFullscreen = (): boolean => region.classList.contains('is-fullscreen-fallback');

  const fitCanvasToFullscreenStage = (): void => {
    if (!stage || !canvas) return;
    if (!isNativeFullscreen() && !isFallbackFullscreen()) {
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
      return;
    }

    const availableWidth = stage.clientWidth;
    const availableHeight = stage.clientHeight;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const canvasAspectRatio = 900 / 560;
    const widthLimited = availableWidth / availableHeight <= canvasAspectRatio;
    const fittedWidth = widthLimited ? availableWidth : availableHeight * canvasAspectRatio;
    const fittedHeight = widthLimited ? availableWidth / canvasAspectRatio : availableHeight;
    canvas.style.width = `${Math.floor(fittedWidth)}px`;
    canvas.style.height = `${Math.floor(fittedHeight)}px`;
  };

  const synchronizeState = (): void => {
    const isFullscreen = isNativeFullscreen() || isFallbackFullscreen();
    region.dataset.fullscreenActive = String(isFullscreen);
    toggle.setAttribute('aria-pressed', String(isFullscreen));
    toggle.setAttribute('aria-label', isFullscreen ? exitLabel : enterLabel);
    toggle.title = isFullscreen ? exitLabel : enterLabel;
    if (enterText) enterText.hidden = isFullscreen;
    if (exitText) exitText.hidden = !isFullscreen;
    icon?.classList.toggle('ph-arrows-out', !isFullscreen);
    icon?.classList.toggle('ph-arrows-in', isFullscreen);
    window.requestAnimationFrame(fitCanvasToFullscreenStage);
    dispatchViewportResize();
  };

  const enterFallbackFullscreen = (): void => {
    fallbackScrollPosition = window.scrollY;
    region.classList.add('is-fullscreen-fallback');
    document.body.classList.add('plab-fullscreen-fallback-active');
    document.body.style.top = `-${fallbackScrollPosition}px`;
    synchronizeState();
  };

  const exitFallbackFullscreen = (): void => {
    region.classList.remove('is-fullscreen-fallback');
    document.body.classList.remove('plab-fullscreen-fallback-active');
    document.body.style.removeProperty('top');
    window.scrollTo(0, fallbackScrollPosition);
    synchronizeState();
  };

  toggle.addEventListener('click', async () => {
    if (isNativeFullscreen()) {
      await document.exitFullscreen();
      return;
    }
    if (isFallbackFullscreen()) {
      exitFallbackFullscreen();
      return;
    }

    if (region.requestFullscreen) {
      try {
        await region.requestFullscreen({ navigationUI: 'hide' });
        return;
      } catch {
        enterFallbackFullscreen();
        return;
      }
    }

    enterFallbackFullscreen();
  });

  document.addEventListener('fullscreenchange', synchronizeState);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isFallbackFullscreen()) {
      exitFallbackFullscreen();
    }
  });

  if (stage && 'ResizeObserver' in window) {
    const stageResizeObserver = new ResizeObserver(fitCanvasToFullscreenStage);
    stageResizeObserver.observe(stage);
  }

  synchronizeState();
}
