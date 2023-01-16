import { TransactionSet } from "@wonderlandlabs/transact"
import { Leaf } from './Leaf'
import { transObj } from '@wonderlandlabs/transact/dist/types'
import { c } from '@wonderlandlabs/collect'
import { keyName, leafConfig, leafI } from './types'
import { distinctUntilChanged, filter, map, Observer } from 'rxjs'
import { handlers } from './handlers'

export class Forest {
  constructor(rootConfig: leafConfig) {
    this.debug = !!rootConfig.debug;
    this.root = new Leaf(this, { id: 'root', ...rootConfig });
    this.addLeaf(this.root);
    this.trans = new TransactionSet(handlers(this));
    const self = this;
    this.trans.subscribe({
      next(transSet) {
        if (transSet.size === 0) {
          if (self.pendingLeafIds.size > 0) {
            self.dot('commitPending');
          }
        } else {
          self.lastTransId = c(transSet)
            .getReduce((memo: number, trans: transObj) => {
                return Math.max(memo, trans.id);
              },
              self.lastTransId) as number;
        }
      },
      error() {

      }
    });
  }

  public debug = false;

  subscribe(listener: Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined) {
    const self = this;
    return this.trans.pipe(
      filter((set) => set.size === 0 && self.pendingLeafIds.size === 0),
      map(() => self.value),
      distinctUntilChanged()
    ).subscribe(listener);
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
    console.log('purgeTo:', transId, 'pending IDs = ', this.pendingLeafIds.values);
    this.pendingLeaves.forEach((leaf: leafI) => {
      console.log('purging leaf ', leaf.toJSON(), 'with pending values to ', transId);
      leaf.purgeAfter(transId);
      console.log('after purging leaf has pendings', leaf.pendings?.values);
    })
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
}
