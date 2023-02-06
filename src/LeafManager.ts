import { leafI } from './types'
import { c } from '@wonderlandlabs/collect'


export class LeafManager {
  public leaves = new Map<string, leafI>();

  private pendingLeafIds = c(new Set<string>());

  markPending(id: string) {
    this.pendingLeafIds.addAfter(id);
  }

  get pendingLeaves() {
    return this.pendingLeafIds.getReduce((memo, id) => {
      const leaf = this.leaves.get(id);
      if (leaf) {
        memo.push(leaf);
      }
      return memo;
    }, []);
  }

  hasPendingLeaves() {
    return this.pendingLeafIds.size > 0
  }

  commitPending() {
    this.pendingLeaves?.forEach((leaf: leafI) => leaf.commitPending());
  }

  unmarkPending(id: string) {
    this.pendingLeafIds.deleteItem(id);
  }

  purgePending(id: number) {
    this.pendingLeaves.forEach((leaf: leafI) => leaf.purgePending(id));
  }

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  purgeTo(transId: number) {
    this.pendingLeaves.forEach((leaf: leafI) => {
      leaf.purgeAfter(transId);
    });
  }

  lastTransId = 0;
}
