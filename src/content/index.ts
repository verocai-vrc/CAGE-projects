import { z } from 'zod';
import { AttributeMetaSchema, ArchetypeSchema, BalanceSchema, JudgeSchema } from '../state/schema';
import { loadContent } from './load';
import balanceRaw from './balance.json';
import attributesRaw from './attributes.json';
import archetypesRaw from './archetypes.json';
import judgesRaw from './judges.json';

export const balance = loadContent('balance.json', balanceRaw, BalanceSchema);
export const attributeMeta = loadContent('attributes.json', attributesRaw, z.array(AttributeMetaSchema));
export const archetypes = loadContent('archetypes.json', archetypesRaw, z.array(ArchetypeSchema));
export const judges = loadContent('judges.json', judgesRaw, z.array(JudgeSchema));
