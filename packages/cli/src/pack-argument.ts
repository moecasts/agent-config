import { packIds } from '@cocasts/agent-config-packs';
import { Argument } from 'commander';

export const requiredPackArgument = (description: string): Argument =>
  new Argument('<pack>', description).choices(packIds);

export const optionalPackArgument = (description: string): Argument =>
  new Argument('[pack]', description).choices(packIds);
