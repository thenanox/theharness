import { TUNING } from '../tuning';

interface Def {
  key: keyof typeof TUNING;
  label: string;
  min: number;
  max: number;
  step: number;
}

const DEFS: Def[] = [
  { key: 'gravityY',         label: 'Gravity',        min: 0.4, max: 2.5,   step: 0.05  },
  { key: 'frictionAir',      label: 'Air friction',   min: 0.001, max: 0.020, step: 0.001 },
  { key: 'swingPump',        label: 'Swing pump',     min: 0.0005, max: 0.006, step: 0.0001 },
  { key: 'detachImpulse',    label: 'Detach impulse', min: 0.002, max: 0.025, step: 0.001  },
  { key: 'reelSpeed',        label: 'Reel speed',     min: 80,  max: 500,   step: 10    },
  { key: 'maxLength',        label: 'Rope max',       min: 150, max: 500,   step: 10    },
  { key: 'maxSpeed',         label: 'Max speed',      min: 4,   max: 25,    step: 1     },
  { key: 'slideThreshold',   label: 'Slide thresh',   min: 1,   max: 8,     step: 0.5   },
  { key: 'slideMinDuration', label: 'Slide ms',       min: 200, max: 3000,  step: 100   },
  { key: 'aimRotateSpeed',   label: 'Aim speed',      min: 0.5, max: 5,     step: 0.1   },
];

function fmt(val: number, step: number): string {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  return val.toFixed(d);
}

export class TuningPanel {
  private el: HTMLDivElement;
  private visible = false;
  private valSpans: Map<string, HTMLSpanElement> = new Map();
  private inputs: Map<string, HTMLInputElement> = new Map();

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:4px;right:4px;z-index:10000;' +
      'background:rgba(0,0,0,0.88);color:#3aff6a;font:11px/1.5 monospace;' +
      'padding:8px 10px;border-radius:6px;display:none;' +
      'max-height:92vh;overflow-y:auto;width:240px;pointer-events:auto;';

    const title = document.createElement('div');
    title.textContent = 'ROPE TUNING  [`] hide';
    title.style.cssText = 'color:#ff7a3d;margin-bottom:6px;font-weight:bold;';
    this.el.appendChild(title);

    for (const def of DEFS) this.addSlider(def);

    const btn = document.createElement('button');
    btn.textContent = 'Copy URL params';
    btn.style.cssText =
      'margin-top:6px;background:#222;color:#3aff6a;border:1px solid #3aff6a;' +
      'padding:3px 8px;cursor:pointer;font:11px monospace;width:100%;';
    btn.onclick = () => {
      const url = new URL(window.location.href);
      for (const def of DEFS) url.searchParams.set(def.key, fmt(TUNING[def.key], def.step));
      navigator.clipboard?.writeText(url.toString());
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy URL params'; }, 1200);
    };
    this.el.appendChild(btn);

    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  refresh(): void {
    for (const def of DEFS) {
      const span = this.valSpans.get(def.key);
      const input = this.inputs.get(def.key);
      if (span) span.textContent = fmt(TUNING[def.key], def.step);
      if (input) input.value = String(TUNING[def.key]);
    }
  }

  private addSlider(def: Def): void {
    const row = document.createElement('div');
    row.style.cssText = 'margin:3px 0;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = def.label;
    const valSpan = document.createElement('span');
    valSpan.textContent = fmt(TUNING[def.key], def.step);
    valSpan.style.color = '#ff7a3d';
    header.appendChild(nameSpan);
    header.appendChild(valSpan);
    this.valSpans.set(def.key, valSpan);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(TUNING[def.key]);
    input.style.cssText = 'width:100%;accent-color:#3aff6a;height:14px;';
    this.inputs.set(def.key, input);

    input.oninput = () => {
      TUNING[def.key] = parseFloat(input.value);
      valSpan.textContent = fmt(TUNING[def.key], def.step);
    };

    row.appendChild(header);
    row.appendChild(input);
    this.el.appendChild(row);
  }
}
