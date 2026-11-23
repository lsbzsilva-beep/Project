import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BLACKWOOD_DOCUMENT_ORDER } from '../game/documents';
import { InspectableDocument } from '../game/types';

interface DocumentModalProps {
  document: InspectableDocument | null;
  collectedDocs: InspectableDocument[];
  onSelectDocument: (doc: InspectableDocument) => void;
  onClose: () => void;
}

export function DocumentModal({
  document,
  collectedDocs,
  onSelectDocument,
  onClose,
}: DocumentModalProps) {
  useEffect(() => {
    if (!document) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.code === 'ArrowLeft' && collectedDocs.length > 1) {
        const idx = collectedDocs.findIndex((d) => d.id === document.id);
        const prevIdx = (idx - 1 + collectedDocs.length) % collectedDocs.length;
        onSelectDocument(collectedDocs[prevIdx]);
      } else if (e.code === 'ArrowRight' && collectedDocs.length > 1) {
        const idx = collectedDocs.findIndex((d) => d.id === document.id);
        const nextIdx = (idx + 1) % collectedDocs.length;
        onSelectDocument(collectedDocs[nextIdx]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [document, collectedDocs, onSelectDocument, onClose]);

  if (!document) return null;

  const currentIdx = Math.max(
    0,
    collectedDocs.findIndex((d) => d.id === document.id),
  );
  const totalCollected = Math.max(1, collectedDocs.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#060807]/85 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-modal-title"
      onClick={onClose}
    >
      <article
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-[#3a2d1b]/65 bg-gradient-to-b from-[#ebe0c6] via-[#e2d3b2] to-[#d4c29c] text-[#1f1912] shadow-2xl"
        style={{ borderRadius: '3px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Archival Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#3a2d1b]/25 px-6 pt-5 pb-4 sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tracking-[0.14em] text-[#5c4a32] uppercase">
              <span>Vale Cinzento</span>
              <span aria-hidden="true">·</span>
              <span>{document.code}</span>
              <span aria-hidden="true">·</span>
              <span>{document.location}</span>
            </div>
            <h2
              id="doc-modal-title"
              className="mt-2 font-serif text-xl font-semibold leading-snug text-[#1c150e] text-balance sm:text-2xl"
            >
              {document.title}
            </h2>
            <p className="mt-1 font-serif text-xs italic text-[#4d3d28]">
              {document.date} · {document.author}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar documento"
            className="flex min-h-[40px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center border border-[#3a2d1b]/35 bg-[#d6c5a0]/70 text-[#2b2115] transition-colors hover:bg-[#c8b387] focus-visible:outline-2 focus-visible:outline-[#5c3e1a]"
            style={{ borderRadius: '3px' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div className="relative overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          {document.stamp && (
            <div className="mb-4 inline-block border-2 border-[#7b231d]/70 px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-[0.22em] text-[#7b231d]/85 uppercase -rotate-2 select-none">
              {document.stamp}
            </div>
          )}

          <div className="space-y-4 font-serif text-[15px] leading-[1.7] text-[#241c13] sm:text-base">
            {document.paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between gap-3 border-t border-[#3a2d1b]/25 bg-[#d8c7a3]/65 px-6 py-3.5 sm:px-8">
          <div className="flex items-center gap-2">
            {totalCollected > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onSelectDocument(
                      collectedDocs[(currentIdx - 1 + totalCollected) % totalCollected],
                    )
                  }
                  className="flex min-h-[40px] cursor-pointer items-center gap-1 border border-[#3a2d1b]/35 bg-[#e6d9ba]/75 px-3 py-2 font-mono text-xs text-[#2b2115] transition-colors hover:bg-[#d5c39c] whitespace-nowrap shrink-0"
                  style={{ borderRadius: '3px' }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <span className="px-1.5 font-mono text-xs tabular-nums text-[#4d3d28]">
                  {currentIdx + 1} / {totalCollected}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSelectDocument(collectedDocs[(currentIdx + 1) % totalCollected])
                  }
                  className="flex min-h-[40px] cursor-pointer items-center gap-1 border border-[#3a2d1b]/35 bg-[#e6d9ba]/75 px-3 py-2 font-mono text-xs text-[#2b2115] transition-colors hover:bg-[#d5c39c] whitespace-nowrap shrink-0"
                  style={{ borderRadius: '3px' }}
                >
                  <span>Próximo</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <span className="font-mono text-[11px] text-[#5c4a32]">
                Arquivo coletado ({totalCollected} de {BLACKWOOD_DOCUMENT_ORDER.length})
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] cursor-pointer border border-[#2b2115] bg-[#2a2116] px-4 py-2 font-mono text-xs tracking-wide text-[#f0e6cf] transition-colors hover:bg-[#3d3020] whitespace-nowrap shrink-0"
            style={{ borderRadius: '3px' }}
          >
            Fechar [ESC]
          </button>
        </div>
      </article>
    </div>
  );
}
