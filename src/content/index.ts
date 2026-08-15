import { z } from 'zod';
import {
  AmateurContentSchema,
  AttributeMetaSchema,
  ArchetypeSchema,
  BalanceSchema,
  JudgeSchema,
  NamePoolSchema,
} from '../state/schema';
import { loadContent } from './load';
import balanceRaw from './balance.json';
import attributesRaw from './attributes.json';
import archetypesRaw from './archetypes.json';
import judgesRaw from './judges.json';
import amateurEventsRaw from './events/amateur.json';
import namesUsaRaw from './names/usa.json';
import namesBrazilRaw from './names/brazil.json';
import namesJapanRaw from './names/japan.json';
import namesIrelandRaw from './names/ireland.json';
import namesPolandRaw from './names/poland.json';

export const balance = loadContent('balance.json', balanceRaw, BalanceSchema);
export const attributeMeta = loadContent('attributes.json', attributesRaw, z.array(AttributeMetaSchema));
export const archetypes = loadContent('archetypes.json', archetypesRaw, z.array(ArchetypeSchema));
export const judges = loadContent('judges.json', judgesRaw, z.array(JudgeSchema));
export const amateurMoments = loadContent('events/amateur.json', amateurEventsRaw, AmateurContentSchema);

const namePoolFiles = [
  { name: 'names/usa.json', raw: namesUsaRaw },
  { name: 'names/brazil.json', raw: namesBrazilRaw },
  { name: 'names/japan.json', raw: namesJapanRaw },
  { name: 'names/ireland.json', raw: namesIrelandRaw },
  { name: 'names/poland.json', raw: namesPolandRaw },
];

export const namePools = Object.freeze(
  namePoolFiles.map(({ name, raw }) => loadContent(name, raw, NamePoolSchema)),
);
