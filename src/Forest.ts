import { TransactionSet } from "@wonderlandlabs/transact"
import { Leaf } from './Leaf'
import { transObj } from '@wonderlandlabs/transact/dist/types'
import { c } from '@wonderlandlabs/collect'
import { leafConfig, leafI } from './types'
import { filter, map, Observer } from 'rxjs'

const handlers = (self: Forest) => ({
  handlers: {
    setLeafFieldValue: [
      (trans: transObj, leafId: string, key: any, value: any) => {
        self.do('updateFieldValue', leafId, key, value);
        self.do('validatePending');
        self.do('commitPending');
      },
      (err: any, trans: transObj, ...other: any[]) => {
        //  console.log('setLeafFieldValue: error', err, ' args: ', trans, other);
        const [leafId] = trans.params;
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.purgePending(trans);
        }
        throw err;
      }
    ],
    setLeafValue: [
      (trans: transObj, leafId: string, value: any) => {
        self.do('update', leafId, value);
        self.do('validatePending');
        self.do('commitPending');
      },
      (err: any, trans: transObj, ...other: any[]) => {
        // console.log('setLeafValue: error', err, ' args: ', trans, other);
        const [leafId] = trans.params;
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.purgePending(trans);
        }
        throw err;
      }
    ],
    commitPending() {
      self.pendingLeaves?.forEach((leaf: leafI) => leaf.commitPending());
    },
    validatePending: () => {
      self.pendingLeaves?.forEach((leaf: leafI) => leaf.validate());
    },
    updateFieldValue: [
      (trans: transObj, leafId: string, key: any, value: any, fromChild?: boolean) => {
        const target = self.leaves.get(leafId);
        if (!target) {
          throw new Error(`updateFieldValue: cannot find ${leafId}`);
        }
        if (target.hasChildFor(key)) {
          const childId = target.childKeys?.keyOf(key);
          self.do('update', childId, value, true);
        } else {
          const store = target.store.clone();
          store.set(key, value);
          target.pushPending(store, trans);
        }
        if (!fromChild && target.parent) {
          self.do('updateFromChild', target.parentId, leafId);
        }
      },
      (error: any, trans: transObj) => {
        const [leafId] = trans.params;
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.purgePending(trans);
        }
        throw error;
      }
    ]
    ,
    update: [
      (trans: transObj, leafId: string, value: any, fromParent?: boolean) => {
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.pushPending(value, trans);
          leaf.shareChildValues();
          if (!fromParent && leaf.parentId) {
            self.trans.do('updateFromChild', leaf.parentId, leafId);
          }
        }
      },
      (error: any, trans: transObj, ...other: any[]) => {
        // console.log('update: error', error, 'args: ', trans, other);
        const [leafId] = trans.params;
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.purgePending(trans);
        }
        throw error;
      }
    ]
    ,
    updateFromChild(trans: transObj, parentId: string, childId: string) {
      const parent = self.leaves.get(parentId);
      const child = self.leaves.get(childId);
      if (parent && child && parent.childKeys?.hasKey(childId)) {
        const key = parent.childKeys?.get(childId);
        if (key !== undefined) {
          self.do('updateFieldValue', parentId, key, child.value, true);
        }
        if (parent.parentId) {
          self.trans.do('updateFromChild', parent.parentId, parentId);
        }
      }
    }
  }
})


export class Forest {
  constructor(rootConfig: leafConfig) {
    this.root = new Leaf(this, rootConfig);
    this.addLeaf(this.root);
    this.trans = new TransactionSet(handlers(this));
    const self = this;
    this.trans.subscribe({
      next(transSet) {
        self.lastTransId = c(transSet)
          .getReduce((memo: number, trans: transObj) => {
              return Math.max(memo, trans.id);
            },
            self.lastTransId) as number;
      },
      error() {

      }
    });
  }

  subscribe(listener: Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined) {
    const self = this;
    this.trans.pipe(
      filter((set) => set.size <= 0),
      map(() => self.value)
    ).subscribe(listener);
  }

  public root: Leaf;
  public leaves = new Map<string, leafI>();
  public trans: TransactionSet;
  public lastTransId = 0;

  do(action: string, ...args: any[]) {
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

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  /* ---------- ROOT passthroughs */

  get value() {
    return this.root?.value;
  }

  set(key: any, value: any) {
    this.root.set(key, value);
  }
}
