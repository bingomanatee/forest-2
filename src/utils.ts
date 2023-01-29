import { distinctUntilChanged, filter, map, share } from 'rxjs';
import { transObj } from '@wonderlandlabs/transact/dist/types';
import { mutators, valuable } from './types';

export const commitPipes = (target: valuable): mutators =>
  target.fast
    ? [filter((set: Set<transObj>) => set.size === 0), map(() => target.value), share()]
    : [filter((set: Set<transObj>) => set.size === 0), map(() => target.value), distinctUntilChanged(), share()];
