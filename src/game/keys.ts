import { KeyItem } from './types';

export const BLACKWOOD_KEYS: Record<string, KeyItem> = {
  'key-mercado': {
    id: 'key-mercado',
    name: 'Chave do Mercado São Jorge',
    shortName: 'Mercado',
    location: 'Posto Vale · Balcão da Loja',
  },
  'key-delegacia': {
    id: 'key-delegacia',
    name: 'Chave do Arsenal da Delegacia',
    shortName: 'Arsenal',
    location: 'Mercado & Farmácia · Fundos',
  },
  'key-igreja': {
    id: 'key-igreja',
    name: 'Chave da Igreja da Colina',
    shortName: 'Igreja',
    location: 'Delegacia · Sala de Evidências',
  },
  'key-abrigo': {
    id: 'key-abrigo',
    name: 'Chave da Casa do Prefeito',
    shortName: 'Prefeito',
    location: 'Igreja da Colina · Sacristia',
  },
};

export const BLACKWOOD_KEY_ORDER: string[] = [
  'key-mercado',
  'key-delegacia',
  'key-igreja',
  'key-abrigo',
];
