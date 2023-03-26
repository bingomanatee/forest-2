import { distinctUntilChanged, filter, map, share } from 'rxjs';
import { transObj } from '@wonderlandlabs/transact/dist/types';
import { listenerFn, listenerObj, listenerType, mutators, pojo, valuable, voidFn } from './types';
import { c } from '@wonderlandlabs/collect';
import { LeafManager } from './LeafManager';
import { TransactionSet } from '@wonderlandlabs/transact';
import { handlers } from './handlers';

/**
 * Desperately tries to repress any error thrown by function;
 * optimistically, invisibly decorates function and returns result
 * @param fn {function}
 * @param onError {string}
 */
export const safeFn = (fn: any, onError = 'error') => {
  if (typeof fn !== 'function') return noopListener;
  return (...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      console.log(onError, { args, fn });
      return undefined;
    }
  };
};

// ----------- RXJS utilities

export const commitPipes = (target: valuable): mutators =>
  target.fast
    ? [filter((set: Set<transObj>) => set.size === 0), map(() => target.valueOf()), share()]
    : [filter((set: Set<transObj>) => set.size === 0), map(() => target.valueOf()), distinctUntilChanged(), share()];

export function noopListener() {}

export function noopVoidListener() {}

/**
 * returns a fully formed observer with hooks for each event.
 * Encases listeners safely to trap thrown errors.
 *
 * @param listener
 * @param errorListener
 * @param completeListener
 */
export const listenerFactory = (
  listener: any = noopListener,
  errorListener: listenerFn = noopListener,
  completeListener: voidFn = noopVoidListener,
): listenerObj => {
  let out: listenerType;
  switch (c(listener).type) {
    case 'object':
      out = listenerObjFactory(listener);
      break;

    case 'function':
      out = listenerFactoryFn(listener as listenerFn, errorListener, completeListener);
      break;

    default: // "empty" or wierd values: flush all parameters and return noops;
      out = listenerFactory();
  }
  return out;
};

function listenerFactoryFn(listener: listenerFn, errorListener: listenerFn, completeListener: voidFn): listenerObj {
  return {
    next: safeFn(listener, 'listener error'),
    error: safeFn(errorListener, 'error handler error'),
    complete: safeFn(completeListener, 'complete handler throws error'),
  };
}

const listenerObjFactory = (listener: pojo): listenerObj => {
  const list = c(listener)
    .clone()
    .map((fn) => {
      if (typeof fn !== 'function') {
        return undefined;
      }
      return fn;
    });
  const { next = noopListener, error = noopListener, complete = noopVoidListener }: listenerObj = list.value;
  return listenerFactoryFn(next, error, complete);
};

export function initTransManager() {
  const mgr = new LeafManager();
  const trans = new TransactionSet(handlers(mgr));
  trans.subscribe(
    listenerFactory((transSet: Set<transObj>) => {
      if (transSet.size === 0) {
        /*if (mgr.hasPendingLeaves()) {
          mgr.commitPending({source: 'trans listener'});
        }*/
      } else {
        mgr.lastTransId = c(transSet).getReduce((memo: number, trans: transObj) => {
          return Math.max(memo, trans.id);
        }, mgr.lastTransId) as number;
      }
    }),
  );
  return {
    leafMgr: mgr,
    trans,
  };
}
