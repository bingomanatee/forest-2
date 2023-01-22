import { TransactionSet } from '@wonderlandlabs/transact';
import { Leaf } from './Leaf';
import { transObj } from '@wonderlandlabs/transact/dist/types';
import { c } from '@wonderlandlabs/collect';
import { keyName, leafConfig, leafI } from './types';
import { distinctUntilChanged, filter, map, Observer } from 'rxjs';
import { handlers } from './handlers';

export class Forest {
  constructor(rootConfig: leafConfig) {
    this.debug = !!rootConfig.debug;
    this.fast = !!rootConfig.fast;
    this.root = new Leaf(this, { id: 'root', ...rootConfig });
    this.addLeaf(this.root);
    this.trans = new TransactionSet(handlers(this));
    const self = this;
    this.trans.subscribe({
      next(transSet) {
        if (transSet.size === 0) {
          if (self.pendingLeafIds.size > 0) {
            self.commitPending();
          }
        } else {
          self.lastTransId = c(transSet).getReduce((memo: number, trans: transObj) => {
            return Math.max(memo, trans.id);
          }, self.lastTransId) as number;
        }
      },
      error() {
      },
    });
  }

  public debug = false;
  private readonly fast: boolean;

  subscribe(listener: Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined) {
    const self = this;
    const pipes = [
      filter((set: Set<transObj>) => set.size === 0),
      map(() => self.value)
    ];

    if (!this.fast) {
      pipes.push(distinctUntilChanged((a: any, b: any) => {
        if (a === b) {
          return true;
        }
        try {
          return JSON.stringify(a) === JSON.stringify(b);
        } catch (_er) {
          return false;
        }
      }))
    }
    // @ts-ignore
    return this.trans.pipe(...pipes)
      .subscribe(listener);
  }

  public leaves = new Map<string, leafI>();
  public trans: TransactionSet;
  public lastTransId = 0;

  /**
   * shortcut to trams.do
   * @param action:
   * @param args
   */
  dot(action: string, ...args: any[]) {
    return this.trans.do(action, ...args);
  }

  public pendingLeafIds = c(new Set<string>());

  get pendingLeaves() {
    return this.pendingLeafIds.getReduce((memo, id) => {
      const leaf = this.leaves.get(id);
      if (leaf) {
        memo.push(leaf);
      }
      return memo;
    }, []);
  }

  markPending(id: string) {
    this.pendingLeafIds.addAfter(id);
  }

  commitPending() {
    this.pendingLeaves?.forEach((leaf: leafI) => leaf.commitPending());
  }

  unmarkPending(id: string) {
    this.pendingLeafIds.deleteItem(id);
  }

  purgePending(trans: transObj) {
    this.pendingLeaves.forEach((leaf: leafI) => leaf.purgePending(trans));
  }

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  purgeTo(transId: number) {
    this.pendingLeaves.forEach((leaf: leafI) => {
      leaf.purgeAfter(transId);
    });
  }

  /* ---------- ROOT --------------
  root leaf, and it's pass-through methods
  */

  public root: leafI;

  get do() {
    return this.root.do;
  }

  child(key: keyName): leafI | undefined {
    return this.root.child(key);
  }

  get value() {
    return this.root?.value;
  }

  set value(newValue) {
    this.root.value = newValue;
  }

  set(key: any, value: any): leafI {
    this.root.set(key, value);
    return this.root;
  }

  get store() {
    return this.root.store;
  }

  // --------------- debugging hooks

  broadcastTrans() {
    const self = this;
    this.trans.subscribe({
      next(list) {
        console.log(
          'transactions:',
          Array.from(list).map(({ id, params, action }) => [`${id}(${action})`, params]),
          'value is ',
          self.value,
        );
      },
      error(err) {
        console.log('error in trans: ', err);
      },
    });

    this.subscribe({
      next(value) {
        console.log('bt value = ', value);
      },
      error(err) {
        console.log('error in sub: ', err);
      },
    });
  }
}
