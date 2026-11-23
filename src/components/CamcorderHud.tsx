import { useEffect, useState } from 'react';

interface CamcorderHudProps {
  visible: boolean;
  resolutionLabel: string;
}

export function CamcorderHud({ visible, resolutionLabel }: CamcorderHudProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 overflow-hidden font-mono text-[#7dff8f]"
      style={{ textShadow: '0 0 6px rgba(80, 255, 120, 0.55)' }}
    >
      {/* Corner Viewfinder Brackets */}
      <span className="absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-[#7dff8f]/85" />
      <span className="absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-[#7dff8f]/85" />
      <span className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-[#7dff8f]/85" />
      <span className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-[#7dff8f]/85" />

      {/* REC & Timecode */}
      <div className="absolute top-14 left-5 flex items-center gap-2.5 text-xs tracking-wider text-[#f04b50] sm:left-7">
        <span className="inline-block h-2.5 w-2.5 bg-[#ff3038]" />
        <strong className="font-semibold">REC</strong>
        <span className="ml-2 tabular-nums text-[#7dff8f]/90">
          {hh}:{mm}:{ss}
        </span>
      </div>

      {/* Bottom Viewfinder Metadata */}
      <div className="absolute bottom-5 left-5 flex gap-4 text-[11px] font-semibold tracking-widest text-[#d7e8d2]/85 sm:left-7">
        <span>480i NTSC</span>
        <span>{resolutionLabel}</span>
        <span>NIGHTSHOT IR</span>
      </div>
    </div>
  );
}
