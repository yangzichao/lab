// Generic DOM wiring shared by every lab. All controls follow one convention:
//   range / checkbox inputs  -> [data-control="<id>"]
//   live value echoes        -> [data-output="<id>"]
//   stat strip values        -> [data-readout="<id>"]
//   buttons                  -> [data-action="toggle" | "reset" | ...]
//   preset buttons           -> [data-preset="<id>"]
// so a single helper set drives all three simulations.

export function getRangeValue(root: HTMLElement, id: string, fallbackValue: number): number {
  const input = root.querySelector<HTMLInputElement>(`[data-control="${id}"]`);
  if (!input) {
    return fallbackValue;
  }
  const parsed = Number(input.value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

export function setRangeValue(root: HTMLElement, id: string, value: number): void {
  const input = root.querySelector<HTMLInputElement>(`[data-control="${id}"]`);
  if (!input) {
    return;
  }
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function isChecked(root: HTMLElement, id: string, fallbackValue = false): boolean {
  const input = root.querySelector<HTMLInputElement>(`[data-control="${id}"]`);
  return input ? input.checked : fallbackValue;
}

export function setOutput(root: HTMLElement, id: string, text: string): void {
  const target = root.querySelector<HTMLElement>(`[data-output="${id}"]`);
  if (target) {
    target.textContent = text;
  }
}

export function setReadout(root: HTMLElement, id: string, text: string): void {
  const target = root.querySelector<HTMLElement>(`[data-readout="${id}"]`);
  if (target) {
    target.textContent = text;
  }
}

export function onControlInput(root: HTMLElement, handler: (input: HTMLInputElement) => void): void {
  root.querySelectorAll<HTMLInputElement>('[data-control]').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventName, () => handler(input));
  });
}

export function bindAction(root: HTMLElement, action: string, handler: () => void): void {
  const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  button?.addEventListener('click', handler);
}

export function bindPresets(root: HTMLElement, handler: (presetId: string) => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const presetId = button.dataset.preset;
      if (presetId) {
        handler(presetId);
      }
    });
  });
}

export function updatePlayPauseButton(root: HTMLElement, running: boolean): void {
  const button = root.querySelector<HTMLButtonElement>('[data-action="toggle"]');
  if (!button) {
    return;
  }

  const icon = button.querySelector<HTMLElement>('i');
  const label = button.querySelector<HTMLElement>('span');
  button.classList.toggle('is-primary', running);
  if (icon) {
    icon.className = running ? 'ph ph-pause' : 'ph ph-play';
  }
  if (label) {
    const runningLabel = button.dataset.runningLabel ?? 'Pause';
    const pausedLabel = button.dataset.pausedLabel ?? 'Play';
    label.textContent = running ? runningLabel : pausedLabel;
  }
}
