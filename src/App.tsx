import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  Briefcase,
  Crosshair,
  Eye,
  FileText,
  Flashlight,
  KeyRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CamcorderHud } from './components/CamcorderHud';
import { DocumentModal } from './components/DocumentModal';
import { InventoryModal } from './components/InventoryModal';
import { MobileControls } from './components/MobileControls';
import { Ps2ControlsDock } from './components/Ps2ControlsDock';
import { SanatorioGame } from './game/SanatorioGame';
import { BLACKWOOD_DOCUMENT_ORDER } from './game/documents';
import { BLACKWOOD_KEY_ORDER } from './game/keys';
import {
  DoorLoadingHudState,
  FloorKey,
  InspectableDocument,
  InventoryItem,
  KeyItem,
  PistolHudState,
  PlayerStatusHudState,
  PS2_PRESETS,
  Ps2PresetId,
  Ps2Settings,
} from './game/types';

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return coarse || (hasTouch && window.innerWidth <= 1024) || window.innerWidth <= 768;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<SanatorioGame | null>(null);

  const [flashlightOn, setFlashlightOn] = useState(true);
  const [pistolState, setPistolState] = useState<PistolHudState>({
    equipped: true,
    ammo: 7,
    magSize: 7,
    reserve: 28,
    reloading: false,
  });
  const [zone, setZone] = useState('Rodovia Sul · Entrada de Vale Cinzento');
  const [currentFloor, setCurrentFloor] = useState<FloorKey>('entrada');
  const [interactPrompt, setInteractPrompt] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showControlsHint, setShowControlsHint] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<InspectableDocument | null>(null);
  const [collectedDocs, setCollectedDocs] = useState<InspectableDocument[]>([]);
  const [collectedKeys, setCollectedKeys] = useState<KeyItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatusHudState>({
    crouched: false,
    hiding: false,
    tension: 0,
    battery: 100,
    compass: 'N',
  });
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [doorLoading, setDoorLoading] = useState<DoorLoadingHudState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const modalStateRef = useRef({ activeDoc: false, doorLoading: false, inventoryOpen: false });
  const [settings, setSettings] = useState<Ps2Settings>({
    ...PS2_PRESETS['silent-fog'],
    visionMode: 'flashlight',
  });

  useEffect(() => {
    modalStateRef.current = {
      activeDoc: Boolean(activeDoc),
      doorLoading: Boolean(doorLoading),
      inventoryOpen,
    };
  }, [activeDoc, doorLoading, inventoryOpen]);

  useEffect(() => {
    setIsMobile(detectTouchDevice());
    const container = mountRef.current;
    if (!container) return;

    const game = new SanatorioGame(container, {
      onFlashlightChange: (on) => setFlashlightOn(on),
      onPistolChange: (state) => setPistolState(state),
      onPlayerStatusChange: (status) => setPlayerStatus(status),
      onInventoryChange: (items) => setInventoryItems(items),
      onZoneChange: (nextZone) => setZone(nextZone),
      onFloorChange: (fl) => setCurrentFloor(fl),
      onInteractPrompt: (prompt) => setInteractPrompt(prompt),
      onAudioMuteChange: (m) => setMuted(m),
      onSettingsChange: (s) => setSettings(s),
      onOpenDocument: (doc, allCollected) => {
        setCollectedDocs(allCollected);
        setActiveDoc(doc);
      },
      onKeysChange: (keys) => setCollectedKeys(keys),
      onStatusToast: (msg) => {
        setStatusToast(msg);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setStatusToast(null), 2800);
      },
      onDoorLoadingChange: (state) => setDoorLoading(state),
    });
    gameRef.current = game;

    const onResize = () => setIsMobile(detectTouchDevice());
    const hideHint = () => setShowControlsHint(false);
    const onGlobalKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat && !modalStateRef.current.activeDoc && !modalStateRef.current.doorLoading) {
          setInventoryOpen((prev) => !prev);
        }
        return;
      }
      if (e.code === 'KeyI' && !e.repeat) {
        if (!modalStateRef.current.activeDoc && !modalStateRef.current.doorLoading) {
          e.preventDefault();
          setInventoryOpen((prev) => !prev);
        }
        return;
      }
      if (
        e.code === 'KeyH' &&
        !e.repeat &&
        !modalStateRef.current.activeDoc &&
        !modalStateRef.current.inventoryOpen
      ) {
        setDockOpen((prev) => !prev);
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onGlobalKey);
    window.addEventListener('keydown', hideHint, { once: true });
    window.addEventListener('pointerdown', hideHint, { once: true });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onGlobalKey);
      window.removeEventListener('keydown', hideHint);
      window.removeEventListener('pointerdown', hideHint);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      gameRef.current = null;
      game.dispose();
    };
  }, []);

  const handleMove = useCallback((x: number, y: number) => {
    setShowControlsHint(false);
    gameRef.current?.setMobileMoveVector(x, y);
  }, []);

  const handleToggleFlashlight = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.toggleFlashlight();
  }, []);

  const handleTogglePistol = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.togglePistol();
  }, []);

  const handleFirePistol = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.firePistol();
  }, []);

  const handleReloadPistol = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.reloadPistol();
  }, []);

  const handleToggleVision = useCallback(() => {
    const next = settings.visionMode === 'ir-camcorder' ? 'flashlight' : 'ir-camcorder';
    gameRef.current?.updateSettings({ visionMode: next });
  }, [settings.visionMode]);

  const handleInteract = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.triggerInteract();
  }, []);

  const handleSprint = useCallback((on: boolean) => {
    setShowControlsHint(false);
    gameRef.current?.setMobileSprint(on);
  }, []);

  const handleSelectPreset = useCallback((preset: Ps2PresetId) => {
    gameRef.current?.applyPreset(preset);
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<Ps2Settings>) => {
    gameRef.current?.updateSettings(patch);
  }, []);

  const handleJumpFloor = useCallback((floor: FloorKey) => {
    gameRef.current?.jumpToFloor(floor);
  }, []);

  useEffect(() => {
    gameRef.current?.setDocumentModalOpen(Boolean(activeDoc));
  }, [activeDoc]);

  useEffect(() => {
    gameRef.current?.setInventoryModalOpen(inventoryOpen);
  }, [inventoryOpen]);

  const handleToggleCrouch = useCallback(() => {
    setShowControlsHint(false);
    gameRef.current?.toggleCrouch();
  }, []);

  const handleExitHide = useCallback(() => {
    gameRef.current?.exitHideCabinet();
  }, []);

  const handleUseInventoryItem = useCallback((itemId: string) => {
    const used = gameRef.current?.useInventoryItem(itemId);
    if (used && itemId === 'item-ammo-32') {
      setInventoryOpen(false);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    gameRef.current?.toggleAudioMute();
  }, []);

  const handleSelectDocument = useCallback((doc: InspectableDocument) => {
    gameRef.current?.playPaperTurnSound();
    setActiveDoc(doc);
  }, []);

  const handleOpenDocFromInventory = useCallback((doc: InspectableDocument) => {
    setInventoryOpen(false);
    gameRef.current?.playPaperTurnSound();
    setActiveDoc(doc);
  }, []);

  const handleCloseDocument = useCallback(() => {
    gameRef.current?.playPaperTurnSound();
    setActiveDoc(null);
  }, []);

  const resolutionLabel =
    settings.resolution === 'native' ? 'HD' : settings.resolution.replace('x', '×');

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden bg-bg text-fg">
      {/* WebGL Canvas Container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Top HUD Bar */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-4 sm:px-7">
        <div>
          <h1 className="font-serif text-sm font-normal tracking-wide text-fg sm:text-base">
            Vale Cinzento
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] tracking-[0.16em] text-muted uppercase">
            <span className="font-mono text-[#e6c484]">{playerStatus.compass}</span>
            <span aria-hidden="true">·</span>
            <span>{zone}</span>
          </p>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <span className="mr-1 hidden font-serif text-xs italic text-muted sm:inline">Pós-Colapso · Serra do Sul</span>

          {collectedKeys.length > 0 && (
            <div
              title={collectedKeys.map((k) => k.name).join(' · ')}
              className="flex items-center gap-1.5 border border-[#695a3d] bg-[#1b1912]/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-[#e6c484]"
              style={{ borderRadius: '4px' }}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{collectedKeys.length}/{BLACKWOOD_KEY_ORDER.length}</span>
            </div>
          )}

          {collectedDocs.length > 0 && (
            <button
              type="button"
              onClick={() => handleSelectDocument(collectedDocs[collectedDocs.length - 1])}
              title="Documentos coletados"
              className="flex cursor-pointer items-center gap-1.5 border border-[#695a3d] bg-[#1e1a12]/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-[#e6d5ad] transition-colors hover:border-[#b8985e]"
              style={{ borderRadius: '4px' }}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{collectedDocs.length}/{BLACKWOOD_DOCUMENT_ORDER.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setInventoryOpen((prev) => !prev)}
            title="Inventário [Tab / I]"
            className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
              inventoryOpen
                ? 'border-[#b8985e] bg-[#2a2216] text-[#f5e7c4]'
                : 'border-[#2b312d] bg-[#101412]/90 text-[#d8ceb8] hover:border-[#695a3d]'
            }`}
            style={{ borderRadius: '4px' }}
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Bolsa</span>
            <span className="text-[#b8985e]">{inventoryItems.length}</span>
          </button>

          {!playerStatus.hiding && (
            <button
              type="button"
              onClick={handleToggleCrouch}
              title="Agachar / Furtividade [C / Ctrl]"
              className={`flex cursor-pointer items-center gap-1 border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                playerStatus.crouched
                  ? 'border-[#b8985e] bg-[#282115] text-[#f5e7c4]'
                  : 'border-[#2b312d] bg-[#101412]/90 text-muted hover:border-[#695a3d]'
              }`}
              style={{ borderRadius: '4px' }}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span className="hidden md:inline">[C]</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleTogglePistol}
            title="Pistola [G] · Atirar [Botão Dir. / Q] · Recarregar [R]"
            className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
              pistolState.equipped
                ? 'border-[#b8985e] bg-[#2a2117] text-[#f5e7c4]'
                : 'border-[#2b312d] bg-[#101412]/90 text-muted hover:border-[#695a3d]'
            }`}
            style={{ borderRadius: '4px' }}
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>
              {pistolState.reloading
                ? 'Recarregando'
                : `${pistolState.ammo}/${pistolState.magSize} · ${pistolState.reserve}`}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleFlashlight}
            title={`Lanterna [F] · Carga ${playerStatus.battery}%`}
            className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors ${
              flashlightOn
                ? 'border-[#b8985e] bg-[#2e2517] text-[#f5e7c4]'
                : 'border-[#2b312d] bg-[#101412]/90 text-muted hover:border-[#695a3d]'
            }`}
            style={{ borderRadius: '4px' }}
          >
            <Flashlight className="h-3.5 w-3.5" />
            <span>[F]{playerStatus.battery < 95 ? ` ${playerStatus.battery}%` : ''}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleVision}
            title="Alternar Visão Noturna IR [V]"
            className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              settings.visionMode === 'ir-camcorder'
                ? 'border-[#7dff8f]/75 bg-[#122618] text-[#7dff8f]'
                : 'border-[#2b312d] bg-[#101412]/90 text-muted hover:border-[#695a3d]'
            }`}
            style={{ borderRadius: '4px' }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>IR</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={muted ? 'Ativar áudio' : 'Silenciar áudio'}
            className="flex cursor-pointer items-center justify-center border border-[#2b312d] bg-[#101412]/90 p-1.5 text-muted transition-colors hover:border-[#695a3d] hover:text-fg"
            style={{ borderRadius: '4px' }}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Center Reticle + Contextual Interaction Label */}
      {!doorLoading && !inventoryOpen && !activeDoc && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          {!playerStatus.hiding && (
            <div className="relative mx-auto h-3 w-3">
              <span
                className={`absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 ${
                  interactPrompt ? 'bg-[#e6c484]' : 'bg-fg/65'
                }`}
              />
              <span
                className={`absolute top-0 left-1/2 h-3 w-px -translate-x-1/2 ${
                  interactPrompt ? 'bg-[#e6c484]' : 'bg-fg/65'
                }`}
              />
            </div>
          )}
          {interactPrompt && (
            <div className="mt-3 border border-[#b8985e]/45 bg-[#0c0f0d]/90 px-2.5 py-1 text-center font-mono text-[11px] tracking-wide whitespace-nowrap text-[#f2e4c2]">
              {interactPrompt}
            </div>
          )}
        </div>
      )}

      {/* Hiding / Crouching Status Indicator */}
      {playerStatus.hiding && !doorLoading && (
        <div
          className="fixed bottom-12 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 border border-[#b8985e]/55 bg-[#0c0f0d]/92 px-3.5 py-1.5 font-mono text-[11px] text-[#f2e4c2]"
          style={{ borderRadius: '4px' }}
        >
          <span>
            Escondido em {playerStatus.hidingLabel ?? 'armário'} · [E / Espaço]
          </span>
          <button
            type="button"
            onClick={handleExitHide}
            className="cursor-pointer border border-[#b8985e]/60 bg-[#2a2115] px-2 py-0.5 text-[10px] tracking-wider text-[#f5e7c4] uppercase hover:bg-[#3b2f1d]"
            style={{ borderRadius: '4px' }}
          >
            Sair
          </button>
        </div>
      )}

      {!playerStatus.hiding && playerStatus.crouched && !doorLoading && (
        <div
          className="pointer-events-none fixed bottom-12 left-5 z-20 border border-[#b8985e]/40 bg-[#0c0f0d]/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-[#d8c69f] uppercase sm:left-7"
          style={{ borderRadius: '4px' }}
        >
          Agachado · Furtivo
        </div>
      )}

      {/* PS2 Door Loading Sector Caption */}
      {doorLoading && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex flex-col items-center gap-1.5 px-6 text-center">
          <p className="font-serif text-sm tracking-[0.22em] text-[#f2e4c2] uppercase sm:text-base">
            {doorLoading.label}
          </p>
          <p className="font-mono text-[11px] tracking-[0.16em] text-[#989282] uppercase">
            {doorLoading.sublabel}
          </p>
          {doorLoading.skippable && (
            <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-[#b8985e]/80 uppercase">
              [Espaço / E] Pular
            </p>
          )}
        </div>
      )}

      {/* Subtle Key/Lock Status Notification */}
      {statusToast && (
        <div
          className="pointer-events-none fixed top-16 left-1/2 z-30 -translate-x-1/2 border border-[#b8985e]/60 bg-[#12110d]/95 px-3.5 py-1.5 font-mono text-[11px] tracking-wide text-[#f2dfba]"
          style={{ borderRadius: '4px' }}
        >
          {statusToast}
        </div>
      )}

      {/* Camcorder IR HUD */}
      <CamcorderHud
        visible={settings.visionMode === 'ir-camcorder'}
        resolutionLabel={resolutionLabel}
      />

      {/* Initial Control Hint */}
      {showControlsHint && !isMobile && (
        <p className="pointer-events-none fixed inset-x-0 bottom-5 z-10 px-6 text-center text-xs tracking-wide text-fg/80">
          Arraste para olhar · WASD andar · Shift correr · C agachar · Tab inventário · F lanterna · Botão Dir. ou Q atirar · R recarregar · G pistola · E interagir
        </p>
      )}

      {/* Collapsible PS2 Graphics & Floor Dock */}
      <Ps2ControlsDock
        open={dockOpen}
        onToggleOpen={() => setDockOpen((prev) => !prev)}
        settings={settings}
        currentFloor={currentFloor}
        onSelectPreset={handleSelectPreset}
        onUpdateSettings={handleUpdateSettings}
        onJumpFloor={handleJumpFloor}
      />

      {/* Mobile Touch Controls */}
      {isMobile && (
        <MobileControls
          flashlightOn={flashlightOn}
          pistolEquipped={pistolState.equipped}
          pistolAmmo={pistolState.ammo}
          crouched={playerStatus.crouched}
          hiding={playerStatus.hiding}
          onMove={handleMove}
          onToggleFlashlight={handleToggleFlashlight}
          onToggleCrouch={handleToggleCrouch}
          onInteract={handleInteract}
          onSprint={handleSprint}
          onFire={handleFirePistol}
          onReload={handleReloadPistol}
        />
      )}

      {/* Investigator Satchel Inventory Modal */}
      <InventoryModal
        open={inventoryOpen}
        items={inventoryItems}
        collectedKeys={collectedKeys}
        collectedDocs={collectedDocs}
        pistolState={pistolState}
        flashlightOn={flashlightOn}
        playerStatus={playerStatus}
        onUseItem={handleUseInventoryItem}
        onOpenDocument={handleOpenDocFromInventory}
        onClose={() => setInventoryOpen(false)}
      />

      {/* Archival Document Reader Modal */}
      <DocumentModal
        document={activeDoc}
        collectedDocs={collectedDocs}
        onSelectDocument={handleSelectDocument}
        onClose={handleCloseDocument}
      />
    </div>
  );
}
