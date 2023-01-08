import { TransactionSet } from "@wonderlandlabs/transact"
import { Leaf } from './Leaf'
import { transObj } from '@wonderlandlabs/transact/dist/types'
import { c } from '@wonderlandlabs/collect'
import { childDef, leafConfig, leafI } from './types'

type forestParams = {
  children?: any;
}

export class Forest {
  constructor(rootConfig: leafConfig) {
    this.root = new Leaf(this, rootConfig);
    this.addLeaf(this.root);
    const self = this;
    this.trans = new TransactionSet({
      handlers: {
        setLeafValue: [
          (trans: transObj, leafId: string, value: any) => {
            self.do('update', leafId, value);
            self.do('validatePending');
            self.do('commitPending');
          },
          (trans: transObj) => {
            const [leafId] = trans.params;
            const leaf = self.leaves.get(leafId);
            if (leaf) {
              leaf.purgePending(trans);
            }
            throw trans.result;
          }
        ],
        commitPending() {
          this.pendingLeaves.forEach((leaf: leafI) => leaf.commitPending());
        },
        validatePending: () => {
          this.pendingLeaves.forEach((leaf: leafI) => leaf.validate());
        },
        updateLeafValue: [
          (trans: transObj, leafId: string, key: any, value: any, fromChild?: boolean) => {
            const target = self.leaves.get(leafId);
            if (!target) {
              throw new Error(`updateLeafValue: cannot find ${leafId}`);
            }
            if (target.hasChildFor(key)) {
              const childId = target.childKeys?.keyOf(key);
              this.do('update', childId, value);
            } else {
              const store = target.store.clone();
              store.set(key, value);
              target.pushPending(store, trans);
            }
            if (!fromChild && target.parent) {
              self.do('updateFromChild', target.parentId, leafId);
            }
          },
          (trans: transObj) => {
            const [leafId] = trans.params;
            const leaf = self.leaves.get(leafId);
            if (leaf) {
              leaf.purgePending(trans);
            }
            throw trans.result;
          }
        ]
        ,
        update: [
          (trans: transObj, leafId: string, value: any, fromParent?: boolean) => {
            const leaf = this.leaves.get(leafId);
            if (leaf) {
              leaf.pushPending(value, trans);
              leaf.shareChildValues();
              if (!fromParent && leaf.parentId) {
                self.trans.do('updateFromChild', leaf.parentId, leafId);
              } else {
                throw new Error(`update: cannot get leaf ${leafId}`)
              }
            }
          },
          (trans: transObj) => {
            const [leafId] = trans.params;
            const leaf = self.leaves.get(leafId);
            if (leaf) {
              leaf.purgePending(trans);
            }
            throw trans.result;
          }
        ]
        ,
        updateFromChild(trans: transObj, parentId: string, childId: string) {
          const parent = self.leaves.get(parentId);
          const child = self.leaves.get(childId);
          if (parent && child && parent.childKeys?.hasKey(childId)) {
            const key = parent.childKeys?.get(childId);
            if (key !== undefined) {
              self.do('updateLeafValue', parentId, key, child.value, true);
            }
            if (parent.parentId) {
              self.trans.do('updateFromChild', parent.parentId, parentId);
            }
          }
        }
      }
    });
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

  public root: Leaf;
  public leaves = new Map<string, leafI>();
  private trans: TransactionSet;
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
    },[]);
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
}
