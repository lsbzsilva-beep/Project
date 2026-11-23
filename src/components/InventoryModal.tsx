import { useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  Briefcase,
  Crosshair,
  FileText,
  Flashlight,
  HeartPulse,
  KeyRound,
  Sparkles,
  X,
} from 'lucide-react';
import { BLACKWOOD_DOCUMENT_ORDER } from '../game/documents';
import { BLACKWOOD_KEY_ORDER } from '../game/keys';
import {
  InspectableDocument,
  InventoryCategory,
  InventoryItem,
  KeyItem,
  PistolHudState,
  PlayerStatusHudState,
} from '../game/types';

type InventoryTab = 'all' | 'supplies' | 'keys' | 'docs';

interface InventoryModalProps {
  open: boolean;
  items: InventoryItem[];
  collectedKeys: KeyItem[];
  collectedDocs: InspectableDocument[];
  pistolState: PistolHudState;
  flashlightOn: boolean;
  playerStatus: PlayerStatusHudState;
  onUseItem: (itemId: string) => void;
  onOpenDocument: (doc: InspectableDocument) => void;
  onClose: () => void;
}

type SelectedEntry =
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'key'; keyItem: KeyItem }
  | { kind: 'doc'; doc: InspectableDocument };

function categoryLabel(category: InventoryCategory): string {
  switch (category) {
    case 'tool':
      return 'Ferramenta';
    case 'weapon':
      return 'Armamento';
    case 'ammo':
      return 'Munição';
    case 'medical':
      return 'Suprimento Médico';
    case 'key':
      return 'Chave';
    case 'relic':
      return 'Relíquia';
  }
}

function ItemIcon({ category }: { category: InventoryCategory }) {
  const cls = 'h-4 w-4 shrink-0';
  switch (category) {
    case 'tool':
      return <Flashlight className={cls} />;
    case 'weapon':
      return <Crosshair className={cls} />;
    case 'ammo':
      return <Briefcase className={cls} />;
    case 'medical':
      return <HeartPulse className={cls} />;
    case 'key':
      return <KeyRound className={cls} />;
    case 'relic':
      return <Sparkles className={cls} />;
  }
}

export function InventoryModal({
  open,
  items,
  collectedKeys,
  collectedDocs,
  pistolState,
  flashlightOn,
  playerStatus,
  onUseItem,
  onOpenDocument,
  onClose,
}: InventoryModalProps) {
  const [tab, setTab] = useState<InventoryTab>('all');
  const [selectedKey, setSelectedKey] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const entries = useMemo<Array<{ uid: string; entry: SelectedEntry }>>(() => {
    const list: Array<{ uid: string; entry: SelectedEntry }> = [];
    if (tab === 'all' || tab === 'supplies') {
      for (const item of items) {
        list.push({ uid: `item:${item.id}`, entry: { kind: 'item', item } });
      }
    }
    if (tab === 'all' || tab === 'keys') {
      for (const keyItem of collectedKeys) {
        list.push({ uid: `key:${keyItem.id}`, entry: { kind: 'key', keyItem } });
      }
    }
    if (tab === 'docs') {
      for (const doc of collectedDocs) {
        list.push({ uid: `doc:${doc.id}`, entry: { kind: 'doc', doc } });
      }
    }
    return list;
  }, [tab, items, collectedKeys, collectedDocs]);

  const activeEntry = useMemo(() => {
    if (entries.length === 0) return null;
    return entries.find((e) => e.uid === selectedKey) ?? entries[0];
  }, [entries, selectedKey]);

  if (!open) return null;

  const pulseLabel =
    playerStatus.tension >= 0.7
      ? 'Agitado'
      : playerStatus.tension >= 0.35
        ? 'Alerta'
        : 'Estável';

  const renderItemBadgeText = (item: InventoryItem): string => {
    if (item.id === 'weapon-pistol') {
      return `${pistolState.ammo}/${pistolState.magSize}`;
    }
    if (item.id === 'tool-flashlight') {
      return flashlightOn ? 'Ligada' : 'Desligada';
    }
    if (item.maxStack > 1 || item.quantity > 1) {
      return `×${item.quantity}`;
    }
    return '1';
  };

  const renderPrimaryActionLabel = (item: InventoryItem): string => {
    if (item.id === 'weapon-pistol') {
      return pistolState.equipped ? 'Guardar Pistola' : 'Empunhar Pistola';
    }
    if (item.id === 'tool-flashlight') {
      return flashlightOn ? 'Desligar Lanterna' : 'Ligar Lanterna';
    }
    return item.useLabel ?? 'Usar';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050706]/85 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-modal-title"
      onClick={onClose}
    >
      <section
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden border border-[#b8985e]/45 bg-[#0e120f] text-[#ede3cc] shadow-2xl"
        style={{ borderRadius: '4px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#b8985e]/25 bg-[#121613] px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-[#9b8d72] uppercase">
              Mochila do Sobrevivente · Vale Cinzento
            </p>
            <h2
              id="inventory-modal-title"
              className="mt-0.5 font-serif text-lg font-normal text-[#f5e7c4] sm:text-xl"
            >
              Bolsa &amp; Suprimentos
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 border border-[#2a312c] bg-[#0b0e0c] px-3 py-1.5 font-mono text-[11px] tabular-nums text-[#cfc4aa]" style={{ borderRadius: '4px' }}>
              <span className="flex items-center gap-1.5" title="Carga da lanterna">
                <BatteryCharging className="h-3.5 w-3.5 text-[#b8985e]" />
                {playerStatus.battery}%
              </span>
              <span className="text-[#4a524c]" aria-hidden="true">|</span>
              <span className="flex items-center gap-1.5" title="Estado do pulso">
                <HeartPulse className="h-3.5 w-3.5 text-[#b8985e]" />
                {pulseLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar inventário"
              className="flex min-h-[40px] cursor-pointer items-center gap-1.5 border border-[#b8985e]/35 bg-[#181d19] px-3 font-mono text-xs text-[#e6d5ad] transition-colors hover:border-[#b8985e] hover:bg-[#232924]"
              style={{ borderRadius: '4px' }}
            >
              <span>Fechar</span>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Category Tabs */}
        <nav
          aria-label="Categorias do inventário"
          className="flex flex-wrap items-center gap-1.5 border-b border-[#242b26] bg-[#0b0e0c] px-5 py-2.5 sm:px-6"
        >
          {(
            [
              { id: 'all', label: `Todos (${items.length + collectedKeys.length})` },
              { id: 'supplies', label: `Suprimentos (${items.length})` },
              { id: 'keys', label: `Chaves (${collectedKeys.length}/${BLACKWOOD_KEY_ORDER.length})` },
              { id: 'docs', label: `Arquivos (${collectedDocs.length}/${BLACKWOOD_DOCUMENT_ORDER.length})` },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[36px] cursor-pointer border px-3 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                  active
                    ? 'border-[#b8985e] bg-[#262016] text-[#f5e7c4]'
                    : 'border-[#252c27] bg-[#111613] text-[#9b9484] hover:border-[#5f523a] hover:text-[#dfd4bc]'
                }`}
                style={{ borderRadius: '4px' }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Two-Pane Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-[#242b26] overflow-hidden md:grid-cols-[1.2fr_1fr] md:divide-x md:divide-y-0">
          {/* Item List */}
          <div className="max-h-[42vh] overflow-y-auto p-4 sm:p-5 md:max-h-[54vh]">
            {entries.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center border border-dashed border-[#2b322d] bg-[#0b0e0c]/60 px-4 text-center">
                <p className="font-serif text-sm text-[#a69d8b]">
                  Nenhum registro nesta seção ainda.
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#736c5e]">
                  Explore casas, comércios e gavetas pela cidade.
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {entries.map(({ uid, entry }) => {
                  const isSelected = activeEntry?.uid === uid;
                  const baseRowCls = `flex w-full cursor-pointer items-center justify-between gap-3 border px-3.5 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-[#b8985e] bg-[#211d15] text-[#f5e7c4]'
                      : 'border-[#222824] bg-[#121714] text-[#d6ccb6] hover:border-[#5b4f39] hover:bg-[#171c19]'
                  }`;

                  if (entry.kind === 'item') {
                    return (
                      <li key={uid}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(uid)}
                          className={baseRowCls}
                          style={{ borderRadius: '4px' }}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="text-[#b8985e]">
                              <ItemIcon category={entry.item.category} />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-serif text-sm">{entry.item.name}</p>
                              <p className="font-mono text-[10px] tracking-wider text-[#8e8677] uppercase">
                                {categoryLabel(entry.item.category)}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 border border-[#3a3428] bg-[#0b0e0c] px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#e6c484]" style={{ borderRadius: '4px' }}>
                            {renderItemBadgeText(entry.item)}
                          </span>
                        </button>
                      </li>
                    );
                  }

                  if (entry.kind === 'key') {
                    return (
                      <li key={uid}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(uid)}
                          className={baseRowCls}
                          style={{ borderRadius: '4px' }}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="text-[#e6c484]">
                              <KeyRound className="h-4 w-4 shrink-0" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-serif text-sm">{entry.keyItem.name}</p>
                              <p className="truncate font-mono text-[10px] tracking-wider text-[#8e8677] uppercase">
                                {entry.keyItem.location}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10px] text-[#b8985e] uppercase">
                            Chave
                          </span>
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={uid}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(uid)}
                        className={baseRowCls}
                        style={{ borderRadius: '4px' }}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="text-[#d9c18c]">
                            <FileText className="h-4 w-4 shrink-0" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-serif text-sm">{entry.doc.title}</p>
                            <p className="truncate font-mono text-[10px] tracking-wider text-[#8e8677] uppercase">
                              {entry.doc.code} · {entry.doc.location}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-[#b8985e] uppercase">
                          Ler
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail Inspector */}
          <div className="flex flex-col justify-between bg-[#0b0e0c] p-5 sm:p-6">
            {!activeEntry ? (
              <div className="my-auto text-center">
                <p className="font-serif text-sm text-[#8d8576]">
                  Selecione um objeto para inspecionar.
                </p>
              </div>
            ) : activeEntry.entry.kind === 'item' ? (
              (() => {
                const item = activeEntry.entry.item;
                const actionBlockedByHide =
                  playerStatus.hiding &&
                  (item.id === 'weapon-pistol' ||
                    item.id === 'tool-flashlight' ||
                    item.id === 'item-ammo-32');
                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] tracking-[0.18em] text-[#b8985e] uppercase">
                          {categoryLabel(item.category)}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-[#a89f8c]">
                          {renderItemBadgeText(item)}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-serif text-lg text-[#f5e7c4]">
                        {item.name}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-[#cfc5af]">
                        {item.description}
                      </p>
                      {item.detailHint && (
                        <p className="mt-3 border-t border-[#222824] pt-3 font-mono text-[11px] leading-relaxed text-[#928a79]">
                          {item.detailHint}
                        </p>
                      )}
                      {actionBlockedByHide && (
                        <p className="mt-3 font-mono text-[11px] text-[#d6a964]">
                          Saia do armário antes de empunhar ou usar este equipamento.
                        </p>
                      )}
                    </div>

                    <div className="mt-5 border-t border-[#222824] pt-4">
                      {item.usable ? (
                        <button
                          type="button"
                          disabled={actionBlockedByHide}
                          onClick={() => onUseItem(item.id)}
                          className="min-h-[42px] w-full cursor-pointer border border-[#b8985e] bg-[#2a2216] px-4 py-2 font-mono text-xs tracking-wider text-[#f5e7c4] uppercase transition-colors hover:bg-[#3a2e1d] disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ borderRadius: '4px' }}
                        >
                          {renderPrimaryActionLabel(item)}
                        </button>
                      ) : (
                        <p className="font-mono text-[11px] text-[#847d6e]">
                          Item de evidência guardado na bolsa.
                        </p>
                      )}
                    </div>
                  </>
                );
              })()
            ) : activeEntry.entry.kind === 'key' ? (
              (() => {
                const keyItem = activeEntry.entry.keyItem;
                return (
                  <>
                    <div>
                      <span className="font-mono text-[10px] tracking-[0.18em] text-[#b8985e] uppercase">
                        Chave de Acesso
                      </span>
                      <h3 className="mt-1.5 font-serif text-lg text-[#f5e7c4]">
                        {keyItem.name}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-[#cfc5af]">
                        Etiqueta de metal gravada: <strong className="font-normal text-[#f2dfba]">{keyItem.shortName}</strong>.
                      </p>
                      <p className="mt-3 border-t border-[#222824] pt-3 font-mono text-[11px] text-[#928a79]">
                        Origem registrada: {keyItem.location}. Aproxime-se da porta trancada correspondente e pressione [E] para destravar.
                      </p>
                    </div>
                    <div className="mt-5 border-t border-[#222824] pt-4">
                      <p className="font-mono text-[11px] text-[#847d6e]">
                        Uso automático ao interagir com a fechadura correta.
                      </p>
                    </div>
                  </>
                );
              })()
            ) : (
              (() => {
                const doc = activeEntry.entry.doc;
                return (
                  <>
                    <div>
                      <span className="font-mono text-[10px] tracking-[0.18em] text-[#b8985e] uppercase">
                        {doc.code} · {doc.location}
                      </span>
                      <h3 className="mt-1.5 font-serif text-lg text-[#f5e7c4]">
                        {doc.title}
                      </h3>
                      <p className="mt-1 font-serif text-xs italic text-[#9e9482]">
                        {doc.date} · {doc.author}
                      </p>
                      <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-[#cfc5af]">
                        {doc.paragraphs[0]}
                      </p>
                    </div>
                    <div className="mt-5 border-t border-[#222824] pt-4">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc)}
                        className="min-h-[42px] w-full cursor-pointer border border-[#b8985e] bg-[#2a2216] px-4 py-2 font-mono text-xs tracking-wider text-[#f5e7c4] uppercase transition-colors hover:bg-[#3a2e1d]"
                        style={{ borderRadius: '4px' }}
                      >
                        Abrir Documento Completo
                      </button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#242b26] bg-[#0b0e0c] px-5 py-2.5 font-mono text-[10px] text-[#867f70] sm:px-6">
          <span>[Tab] ou [I] para abrir/fechar · [C] agachar · [E] abrir gavetas e armários</span>
          <span>Vale Cinzento</span>
        </footer>
      </section>
    </div>
  );
}
