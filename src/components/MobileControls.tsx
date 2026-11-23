import { useRef, useState } from 'react';
import { ArrowDown, Crosshair, Flashlight, Hand, RotateCw } from 'lucide-react';

interface MobileControlsProps {
  flashlightOn: boolean;
  pistolEquipped: boolean;
  pistolAmmo: number;
  crouched: boolean;
  hiding: boolean;
  onMove: (x: number, y: number) => void;
  onToggleFlashlight: () => void;
  onToggleCrouch: () => void;
  onInteract: () => void;
  onSprint: (on: boolean) => void;
  onFire: () => void;
  onReload: () => void;
}

export function MobileControls({
  flashlightOn,
  pistolEquipped,
  pistolAmmo,
  crouched,
  hiding,
  onMove,
  onToggleFlashlight,
  onToggleCrouch,
  onInteract,
  onSprint,
  onFire,
  onReload,
}: MobileControlsProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / maxR, -dy / maxR);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-14 z-20 flex items-end justify-between px-5 sm:px-8">
      {/* Virtual Thumbstick */}
      <div
        ref={padRef}
        className="pointer-events-auto relative h-28 w-28 border border-[#b8985e]/35 bg-[#0c0f0d]/85"
        style={{ borderRadius: '50%' }}
        onTouchStart={(e) => {
          e.preventDefault();
          const t = e.changedTouches[0];
          if (!t) return;
          touchIdRef.current = t.identifier;
          updateFromClient(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          e.preventDefault();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === touchIdRef.current) {
              updateFromClient(t.clientX, t.clientY);
            }
          }
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          touchIdRef.current = null;
          setKnob({ x: 0, y: 0 });
          onMove(0, 0);
        }}
      >
        <div
          className="absolute top-1/2 left-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 border border-[#b8985e]/70 bg-[#2a2419]"
          style={{
            borderRadius: '50%',
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>

      {/* Action Buttons */}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {!hiding && pistolEquipped && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReload}
              aria-label="Recarregar pistola"
              className="flex h-10 w-10 items-center justify-center border border-[#2b312d] bg-[#101412]/90 text-[#c9bfa8]"
              style={{ borderRadius: '4px' }}
            >
              <RotateCw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onFire}
              aria-label="Atirar pistola"
              className="flex h-11 items-center gap-1.5 border border-[#b8985e]/70 bg-[#2e2017]/95 px-3 font-mono text-[11px] font-semibold text-[#f5e7c4]"
              style={{ borderRadius: '4px' }}
            >
              <Crosshair className="h-4 w-4" />
              <span>{pistolAmmo}</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {hiding ? (
            <button
              type="button"
              onClick={onInteract}
              className="flex h-11 items-center gap-1.5 border border-[#b8985e] bg-[#2a2216]/95 px-3.5 font-mono text-[11px] font-semibold tracking-wider text-[#f5e7c4] uppercase"
              style={{ borderRadius: '4px' }}
            >
              <Hand className="h-4 w-4" />
              <span>Sair do Armário</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleCrouch}
                aria-label="Agachar"
                className={`flex h-11 items-center gap-1 border px-2.5 font-mono text-[11px] font-semibold tracking-wider uppercase ${
                  crouched
                    ? 'border-[#b8985e] bg-[#2c2417] text-[#f5e7c4]'
                    : 'border-[#2b312d] bg-[#101412]/90 text-[#c9bfa8]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span>Agachar</span>
              </button>

              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  onSprint(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onSprint(false);
                }}
                className="h-11 border border-[#b8985e]/40 bg-[#101412]/90 px-3 font-mono text-[11px] font-semibold tracking-wider text-[#e2dac9] uppercase"
                style={{ borderRadius: '4px' }}
              >
                Correr
              </button>

              <button
                type="button"
                onClick={onToggleFlashlight}
                aria-label="Alternar lanterna"
                className={`flex h-11 w-11 items-center justify-center border ${
                  flashlightOn
                    ? 'border-[#b8985e] bg-[#362c1c] text-[#f5e7c4]'
                    : 'border-[#2b312d] bg-[#101412]/90 text-[#989282]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                <Flashlight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onInteract}
                aria-label="Interagir"
                className="flex h-11 w-11 items-center justify-center border border-[#b8985e]/55 bg-[#1a1f1c]/95 text-[#e2dac9]"
                style={{ borderRadius: '4px' }}
              >
                <Hand className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
