import { z } from 'zod';
import { AttributeMetaSchema, ArchetypeSchema, BalanceSchema } from '../state/schema';
import { loadContent } from './load';
import balanceRaw from './balance.json';
import attributesRaw from './attributes.json';
import archetypesRaw from './archetypes.json';

export const balance = loadContent('balance.json', balanceRaw, BalanceSchema);
export const attributeMeta = loadContent('attributes.json', attributesRaw, z.array(AttributeMetaSchema));
export const archetypes = loadContent('archetypes.json', archetypesRaw, z.array(ArchetypeSchema));
