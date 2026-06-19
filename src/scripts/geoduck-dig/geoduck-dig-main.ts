import type { BeachShow, DigInput, DigResult, SessionTally, ToolId } from './geoduck-dig-types';
import { DAILY_LIMIT, TIDE_WINDOW_SECONDS, TOOLS } from './geoduck-dig-config';
import { DigSession } from './dig-engine';
import { drawDig, drawSurvey } from './dig-renderer';
import { fieldGuess, generateShows, readClues } from './beach-survey';

type Phase = 'survey' | 'inspect' | 'dig' | 'ended';

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function initGeoduckDig(): void {
  const root = document.querySelector<HTMLElement>('[data-geoduck-dig]');
  if (!root) {
    return;
  }
  const canvas = query<HTMLCanvasElement>(root, '[data-geoduck-canvas]');
  const context = canvas?.getContext('2d') ?? null;
  if (!canvas || !context) {
    return;
  }

  // ---- mutable game state -------------------------------------------------
  let phase: Phase = 'survey';
  let activeTool: ToolId = 'pvc-tube';
  let shows: BeachShow[] = generateShows(5);
  let hoverShowId: number | null = null;
  let selectedShow: BeachShow | null = null;
  let session: DigSession | null = null;
  let tideRemaining = TIDE_WINDOW_SECONDS;
  let resultHandled = false;
  let flashUntil = 0;
  const tally: SessionTally = {
    geoducks: 0,
    totalWeightLb: 0,
    snapped: 0,
    horseClams: 0,
    cockles: 0,
  };

  const input: DigInput = { digging: false, pulling: false, rock: false };

  // ---- canvas sizing ------------------------------------------------------
  let cssWidth = 0;
  let cssHeight = 0;
  function resize(): void {
    const rect = canvas!.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = Math.min(Math.max(rect.width * 0.62, 360), 560);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = Math.round(cssWidth * dpr);
    canvas!.height = Math.round(cssHeight * dpr);
    canvas!.style.height = `${cssHeight}px`;
    context!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- DOM handles --------------------------------------------------------
  const el = {
    tideFill: query<HTMLElement>(root, '[data-tide-fill]'),
    tideTime: query<HTMLElement>(root, '[data-tide-time]'),
    tallyGeoducks: query<HTMLElement>(root, '[data-tally-geoducks]'),
    tallyWeight: query<HTMLElement>(root, '[data-tally-weight]'),
    tallySnapped: query<HTMLElement>(root, '[data-tally-snapped]'),
    tallyHorse: query<HTMLElement>(root, '[data-tally-horse]'),
    phaseHint: query<HTMLElement>(root, '[data-phase-hint]'),
    toolRack: query<HTMLElement>(root, '[data-tool-rack]'),
    inspect: query<HTMLElement>(root, '[data-inspect]'),
    inspectTitle: query<HTMLElement>(root, '[data-inspect-title]'),
    inspectClues: query<HTMLElement>(root, '[data-inspect-clues]'),
    inspectGuess: query<HTMLElement>(root, '[data-inspect-guess]'),
    inspectDig: query<HTMLButtonElement>(root, '[data-inspect-dig]'),
    inspectBack: query<HTMLButtonElement>(root, '[data-inspect-back]'),
    digControls: query<HTMLElement>(root, '[data-dig-controls]'),
    depthRead: query<HTMLElement>(root, '[data-depth-read]'),
    suction: query<HTMLElement>(root, '[data-suction]'),
    suctionFill: query<HTMLElement>(root, '[data-suction-fill]'),
    pullGreen: query<HTMLElement>(root, '[data-pull-green]'),
    pullMarker: query<HTMLElement>(root, '[data-pull-marker]'),
    digFlash: query<HTMLElement>(root, '[data-dig-flash]'),
    btnRock: query<HTMLButtonElement>(root, '[data-btn-rock]'),
    btnAbandon: query<HTMLButtonElement>(root, '[data-btn-abandon]'),
    result: query<HTMLElement>(root, '[data-result]'),
    resultText: query<HTMLElement>(root, '[data-result-text]'),
    sessionEnd: query<HTMLElement>(root, '[data-session-end]'),
    endSummary: query<HTMLElement>(root, '[data-end-summary]'),
    restart: query<HTMLButtonElement>(root, '[data-restart]'),
  };

  function setHidden(node: HTMLElement | null, hidden: boolean): void {
    if (node) {
      node.classList.toggle('is-hidden', hidden);
    }
  }

  // ---- phase transitions --------------------------------------------------
  function syncPanels(): void {
    setHidden(el.inspect, phase !== 'inspect');
    setHidden(el.digControls, phase !== 'dig');
    setHidden(el.sessionEnd, phase !== 'ended');
    setHidden(el.toolRack, phase === 'dig' || phase === 'ended');
  }

  function enterSurvey(): void {
    phase = 'survey';
    selectedShow = null;
    session = null;
    if (shows.length < 2) {
      shows = generateShows(5);
    }
    setPhaseHint('Pick a tool, then click a show on the flat to inspect it.');
    syncPanels();
  }

  function enterInspect(show: BeachShow): void {
    phase = 'inspect';
    selectedShow = show;
    show.inspected = true;
    renderInspect(show);
    setPhaseHint('Read the clues. Dig it, or go back and pick another show.');
    syncPanels();
  }

  function startDig(): void {
    if (!selectedShow) {
      return;
    }
    const tool = TOOLS.find((candidate) => candidate.id === activeTool) ?? TOOLS[1];
    session = new DigSession(tool, selectedShow.clam);
    resultHandled = false;
    input.digging = false;
    input.pulling = false;
    phase = 'dig';
    setPhaseHint('Hold on the hole to dig. Reach the body, rock out suction, then pull.');
    syncPanels();
  }

  function endSession(reason: 'win' | 'tide'): void {
    phase = 'ended';
    renderEndSummary(reason);
    syncPanels();
  }

  // ---- result handling ----------------------------------------------------
  function recordResult(result: DigResult): void {
    if (selectedShow) {
      shows = shows.filter((show) => show.id !== selectedShow!.id);
    }

    switch (result.outcome) {
      case 'intact':
        if (result.species === 'geoduck') {
          tally.geoducks += 1;
          tally.totalWeightLb += result.weightLb;
        } else if (result.species === 'horse-clam') {
          tally.horseClams += 1;
          tally.totalWeightLb += result.weightLb;
        } else {
          tally.cockles += 1;
        }
        break;
      case 'snapped':
      case 'crushed':
        if (result.species === 'geoduck') {
          tally.snapped += 1;
        }
        break;
      default:
        break;
    }

    showResultToast(result);
    renderTally();

    if (tally.geoducks >= DAILY_LIMIT) {
      endSession('win');
      return;
    }
    if (result.outcome === 'tide-out' || tideRemaining <= 0) {
      endSession('tide');
      return;
    }
    enterSurvey();
  }

  let toastTimer = 0;
  function showResultToast(result: DigResult): void {
    if (!el.result || !el.resultText) {
      return;
    }
    el.resultText.textContent = result.message;
    el.result.dataset.outcome = result.outcome;
    el.result.classList.remove('is-hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      el.result?.classList.add('is-hidden');
    }, 2600);
  }

  // ---- DOM rendering ------------------------------------------------------
  function setPhaseHint(text: string): void {
    if (el.phaseHint) {
      el.phaseHint.textContent = text;
    }
  }

  function renderTally(): void {
    if (el.tallyGeoducks) {
      el.tallyGeoducks.textContent = `${tally.geoducks}/${DAILY_LIMIT}`;
    }
    if (el.tallyWeight) {
      el.tallyWeight.textContent = `${tally.totalWeightLb.toFixed(1)} lb`;
    }
    if (el.tallySnapped) {
      el.tallySnapped.textContent = String(tally.snapped);
    }
    if (el.tallyHorse) {
      el.tallyHorse.textContent = String(tally.horseClams);
    }
  }

  function renderInspect(show: BeachShow): void {
    if (el.inspectTitle) {
      el.inspectTitle.textContent = `Show on the flat`;
    }
    if (el.inspectClues) {
      el.inspectClues.innerHTML = '';
      for (const clue of readClues(show.clam)) {
        const row = document.createElement('li');
        row.className = `inspect__clue ${clue.goodSign ? 'is-good' : 'is-bad'}`;
        const label = document.createElement('span');
        label.className = 'inspect__clue-label';
        label.textContent = clue.label;
        const value = document.createElement('span');
        value.className = 'inspect__clue-value';
        value.textContent = clue.value;
        row.append(label, value);
        el.inspectClues.append(row);
      }
    }
    if (el.inspectGuess) {
      el.inspectGuess.textContent = fieldGuess(show.clam);
    }
  }

  function renderEndSummary(reason: 'win' | 'tide'): void {
    if (!el.endSummary) {
      return;
    }
    const headline =
      reason === 'win'
        ? `Limit! You kept your ${DAILY_LIMIT} geoducks before the tide turned.`
        : `Tide's in. Time to head home.`;
    el.endSummary.innerHTML = `
      <p class="end__headline">${headline}</p>
      <ul class="end__stats">
        <li><strong>${tally.geoducks}</strong> geoducks kept</li>
        <li><strong>${tally.totalWeightLb.toFixed(1)} lb</strong> total haul</li>
        <li><strong>${tally.snapped}</strong> necks snapped</li>
        <li><strong>${tally.horseClams}</strong> horse clams (bycatch)</li>
      </ul>`;
  }

  // ---- live dig HUD -------------------------------------------------------
  function updateDigHud(): void {
    if (!session) {
      return;
    }
    const snap = session.snapshot();
    if (el.depthRead) {
      el.depthRead.textContent = `Dug ${snap.dugDepthFt.toFixed(1)} ft · body ≈ ${snap.clam.bodyDepthFt.toFixed(1)} ft`;
    }
    if (el.suctionFill) {
      el.suctionFill.style.width = `${Math.round(snap.suction * 100)}%`;
    }
    if (el.suction) {
      el.suction.classList.toggle('is-high', snap.suction > 0.6);
    }
    if (el.pullGreen) {
      const left = snap.band.greenStart * 100;
      const widthPct = Math.max(0, (snap.band.greenEnd - snap.band.greenStart) * 100);
      el.pullGreen.style.left = `${left}%`;
      el.pullGreen.style.width = `${widthPct}%`;
    }
    if (el.pullMarker) {
      el.pullMarker.style.left = `${Math.min(100, snap.tension * 100)}%`;
      el.pullMarker.style.opacity = snap.tension > 0 ? '1' : '0';
    }
    const nudge = session.getNudge();
    if (nudge) {
      flashMessage(nudge);
    }
    if (el.digFlash) {
      el.digFlash.classList.toggle('is-visible', performance.now() < flashUntil);
    }
  }

  function flashMessage(text: string): void {
    if (el.digFlash) {
      el.digFlash.textContent = text;
      flashUntil = performance.now() + 1600;
    }
  }

  // ---- main loop ----------------------------------------------------------
  let lastTime = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (phase === 'dig' && session) {
      tideRemaining -= dt;
      if (tideRemaining <= 0) {
        tideRemaining = 0;
        session.forceTideOut();
      }
      session.update(dt, input);
      input.rock = false;

      const result = session.getResult();
      if (result && !resultHandled) {
        resultHandled = true;
        recordResult(result);
      } else {
        updateDigHud();
      }
    }

    renderTide();
    renderCanvas();
    requestAnimationFrame(frame);
  }

  function renderTide(): void {
    const fraction = Math.max(0, tideRemaining / TIDE_WINDOW_SECONDS);
    if (el.tideFill) {
      el.tideFill.style.width = `${fraction * 100}%`;
      el.tideFill.classList.toggle('is-low', fraction < 0.25);
    }
    if (el.tideTime) {
      el.tideTime.textContent = formatClock(tideRemaining);
    }
  }

  function renderCanvas(): void {
    context!.clearRect(0, 0, cssWidth, cssHeight);
    if (phase === 'dig' && session) {
      drawDig(context!, cssWidth, cssHeight, session.snapshot());
    } else {
      drawSurvey(context!, cssWidth, cssHeight, shows, hoverShowId);
    }
  }

  // ---- input wiring -------------------------------------------------------
  function pointerToCanvas(event: PointerEvent): { x: number; y: number } {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function hitTestShow(x: number, y: number): BeachShow | null {
    for (const show of shows) {
      const dx = show.x * cssWidth - x;
      const dy = show.y * cssHeight - y;
      if (Math.hypot(dx, dy) < 30) {
        return show;
      }
    }
    return null;
  }

  canvas.addEventListener('pointermove', (event) => {
    if (phase !== 'survey') {
      return;
    }
    const { x, y } = pointerToCanvas(event);
    const hit = hitTestShow(x, y);
    hoverShowId = hit ? hit.id : null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (phase === 'survey') {
      const { x, y } = pointerToCanvas(event);
      const hit = hitTestShow(x, y);
      if (hit) {
        enterInspect(hit);
      }
      return;
    }
    if (phase === 'dig') {
      input.digging = true;
      canvas.setPointerCapture(event.pointerId);
    }
  });

  const releasePointer = (): void => {
    input.digging = false;
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', () => {
    input.digging = false;
    input.pulling = false;
  });

  // Tool rack.
  el.toolRack?.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTool = (button.dataset.tool as ToolId) ?? activeTool;
      el.toolRack
        ?.querySelectorAll<HTMLButtonElement>('[data-tool]')
        .forEach((other) => other.classList.toggle('is-active', other === button));
    });
  });

  el.inspectDig?.addEventListener('click', startDig);
  el.inspectBack?.addEventListener('click', enterSurvey);

  // Hold-to-pull and hold-to-dig buttons (pointer based for touch support).
  const bindHold = (
    node: HTMLElement | null,
    onDown: () => void,
    onUp: () => void,
  ): void => {
    if (!node) {
      return;
    }
    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      onDown();
    });
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointerleave', onUp);
    node.addEventListener('pointercancel', onUp);
  };

  bindHold(
    query<HTMLElement>(root, '[data-btn-dig]'),
    () => {
      if (phase === 'dig') input.digging = true;
    },
    () => {
      input.digging = false;
    },
  );
  bindHold(
    query<HTMLElement>(root, '[data-btn-pull]'),
    () => {
      if (phase === 'dig') input.pulling = true;
    },
    () => {
      input.pulling = false;
    },
  );

  el.btnRock?.addEventListener('click', () => {
    if (phase === 'dig') {
      input.rock = true;
    }
  });
  el.btnAbandon?.addEventListener('click', () => {
    session?.abandon();
  });
  el.restart?.addEventListener('click', () => {
    resetSession();
  });

  // Keyboard controls.
  window.addEventListener('keydown', (event) => {
    if (phase !== 'dig') {
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      input.digging = true;
    } else if (event.code === 'KeyP' || event.code === 'Enter') {
      event.preventDefault();
      input.pulling = true;
    } else if (event.code === 'KeyR' && !event.repeat) {
      input.rock = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      input.digging = false;
    } else if (event.code === 'KeyP' || event.code === 'Enter') {
      input.pulling = false;
    }
  });

  function resetSession(): void {
    tideRemaining = TIDE_WINDOW_SECONDS;
    tally.geoducks = 0;
    tally.totalWeightLb = 0;
    tally.snapped = 0;
    tally.horseClams = 0;
    tally.cockles = 0;
    shows = generateShows(5);
    hoverShowId = null;
    renderTally();
    enterSurvey();
  }

  // ---- boot ---------------------------------------------------------------
  window.addEventListener('resize', resize);
  resize();
  renderTally();
  enterSurvey();
  requestAnimationFrame(frame);
}
