import { InventoryItem } from './types';

export interface ItemCatalogEntry {
  id: string;
  name: string;
  category: InventoryItem['category'];
  description: string;
  maxStack: number;
  usable: boolean;
  useLabel?: string;
  detailHint?: string;
  grantAmount?: number;
}

export const BLACKWOOD_ITEM_CATALOG: Record<string, ItemCatalogEntry> = {
  'tool-flashlight': {
    id: 'tool-flashlight',
    name: 'Lanterna Tática de Latão',
    category: 'tool',
    description:
      'Lanterna portátil de corpo metálico com interruptor de polegar. Essencial para explorar becos, casas sem energia e a orla do pinheiral.',
    maxStack: 1,
    usable: true,
    useLabel: 'Ligar / Desligar [F]',
    detailHint: 'Atalho: tecla [F]',
  },
  'weapon-pistol': {
    id: 'weapon-pistol',
    name: 'Pistola .32 ACP',
    category: 'weapon',
    description:
      'Semiautomática compacta com empunhadura em nogueira e carregador para 7 cartuchos. Defesa confiável para sobrevivência urbana.',
    maxStack: 1,
    usable: true,
    useLabel: 'Empunhar / Guardar [G]',
    detailHint: 'Atirar: Botão Direito ou [Q] · Recarregar: [R]',
  },
  'item-ammo-32': {
    id: 'item-ammo-32',
    name: 'Cartuchos .32 ACP',
    category: 'ammo',
    description:
      'Caixa de munição calibre .32 ACP encontrada em gavetas, oficinas e delegacias.',
    maxStack: 99,
    usable: true,
    useLabel: 'Recarregar Pistola [R]',
    detailHint: 'Cada caixa encontrada fornece +7 cartuchos',
    grantAmount: 7,
  },
  'item-bandage': {
    id: 'item-bandage',
    name: 'Bandagem Estéril',
    category: 'medical',
    description:
      'Rolo de gaze selado de farmácia. Estanca ferimentos leves, reduz o tremor das mãos e estabiliza a respiração.',
    maxStack: 8,
    usable: true,
    useLabel: 'Aplicar Curativo',
    detailHint: 'Reduz tensão e estabiliza a respiração',
    grantAmount: 1,
  },
  'item-laudanum': {
    id: 'item-laudanum',
    name: 'Tônico Analgésico',
    category: 'medical',
    description:
      'Frasco âmbar manipulado na Farmácia São Jorge. Acalma imediatamente os batimentos cardíacos e firma a mira.',
    maxStack: 6,
    usable: true,
    useLabel: 'Tomar Dose',
    detailHint: 'Zera o estresse e firma a mira por 45 segundos',
    grantAmount: 1,
  },
  'item-battery': {
    id: 'item-battery',
    name: 'Pilha Seca de Latão',
    category: 'tool',
    description:
      'Célula seca cilíndrica de longa duração. Restaura a carga da lanterna de mão durante explorações noturnas.',
    maxStack: 6,
    usable: true,
    useLabel: 'Trocar Pilha',
    detailHint: 'Restaura +65% da carga da lanterna',
    grantAmount: 1,
  },
  'item-relic-watch': {
    id: 'item-relic-watch',
    name: 'Relógio do Delegado',
    category: 'relic',
    description:
      'Relógio de bolso em prata escurecida encontrado na Delegacia. Os ponteiros pararam exatamente na hora do apagão.',
    maxStack: 1,
    usable: false,
    detailHint: 'Lembrança encontrada na Delegacia',
    grantAmount: 1,
  },
  'item-relic-medal': {
    id: 'item-relic-medal',
    name: 'Medalhão da Paróquia',
    category: 'relic',
    description:
      'Medalha oxidada com o brasão antigo de Vale Cinzento gravado no verso.',
    maxStack: 1,
    usable: false,
    detailHint: 'Relíquia encontrada na Igreja da Colina',
    grantAmount: 1,
  },
};

export function createInitialInventory(): InventoryItem[] {
  return [
    { ...BLACKWOOD_ITEM_CATALOG['tool-flashlight'], quantity: 1 },
    { ...BLACKWOOD_ITEM_CATALOG['weapon-pistol'], quantity: 1 },
    { ...BLACKWOOD_ITEM_CATALOG['item-ammo-32'], quantity: 28 },
    { ...BLACKWOOD_ITEM_CATALOG['item-bandage'], quantity: 1 },
    { ...BLACKWOOD_ITEM_CATALOG['item-battery'], quantity: 1 },
  ];
}
