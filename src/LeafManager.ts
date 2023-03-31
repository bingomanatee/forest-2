import { leafI } from './types';
import { BehaviorSubject, Subject } from 'rxjs';
import { generalObj } from '@wonderlandlabs/collect/lib/types';
import { transactionSet, transObj } from '@wonderlandlabs/transact/dist/types';
import sortBy from 'lodash.sortby';

export class LeafManager {
  public trans?: transactionSet;

  public leaves = new Map<string, leafI>();

  public debugger = new Subject<generalObj>();

  public debug(message: generalObj) {
    console.log('debug: ', message);
    this.debugger.next(message);
  }

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  pendingTrans(transId = 0) {
    //@ts-ignore
    const subject: BehaviorSubject<Set<transObj>> = this.trans as BehaviorSubject<Set<transObj>>;
    const pending = Array.from(subject.value).filter((subject) => subject.id >= transId);
    const sorted: transObj[] = sortBy(pending, 'id').reverse();
    return sorted;
  }

  backupLeaf(id: string) {
    if (!this.trans) {
      return null;
    }

    const leaf = this.leaves.get(id);
    if (!leaf) {
      return;
    }
    // @ts-ignore

    const pending = this.pendingTrans(0);
    const value = leaf.value;

    for (const trans of pending) {
      if (!trans.meta.has('backupMap')) {
        trans.meta.set('backupMap', new Map([[id, value]]));
      } else {
        const oldMap: Map<string, unknown> = trans.meta.get('backupMap');
        if (!oldMap.has(id)) {
          oldMap.set(id, leaf.value);
        }
      }
    }
  }

  _report(transId: number) {
    const lines = [];
    for (const trans of this.pendingTrans(transId)) {
      lines.push(['=============report -- failure at ', transId].join(' '));
      lines.push(['---- trans ', trans.id].join(' '));
      if (trans.meta.has('backupMap')) {
        trans.meta.get('backupMap').forEach((value: unknown, leafId: string) => {
          lines.push(['    leaf id', leafId, 'has ', JSON.stringify(value)].join(' '));
        });
      }
    }
    lines.push('========================');
    console.log(lines.join('\n'));
  }
  restoreBackups(transId: number) {
    const restored = new Set<string>();

    this.pendingTrans(transId).forEach((trans: transObj) => {
      if (!trans.meta.has('backupMap')) {
        return;
      }

      const backupMap: Map<string, unknown> = trans.meta.get('backupMap');
      restored.forEach((key) => backupMap.delete(key));
      backupMap.forEach((value, leafId: string) => {
        if (restored.has(leafId)) return;
        const leaf = this.leaves.get(leafId);
        if (!leaf) {
          return;
        }
        leaf.store.value = value;
        restored.add(leafId);
        backupMap.delete(leafId);
      });
    });
  }

  lastTransId = 0;

  validate() {
    const changes = this.pendingTrans(-1);
    changes.forEach((trans) => {
      const changedLeaves: string[] = trans.meta.has('backupMap') ? Array.from(trans.meta.get('backupMap').keys()) : [];
      const checked = new Set<string>();

      changedLeaves.forEach((leafId: string) => {
        this.validateLeaf(leafId, checked);
        const leaf = this.leaves.get(leafId);
        if (leaf?.parentId) {
          this.validateLeaf(leaf.parentId, checked, true);
        }
      });
    });
  }

  validateLeaf(leafId: string, checked: Set<string>, down = false) {
    const leaf = this.leaves.get(leafId);
    if (!leaf) {
      return;
    }
    if (!down) {
      leaf.children.forEach((child) => {
        const childId = child.leafId;
        this.validateLeaf(childId, checked);
      });
    }
    if (checked.has(leafId)) {
      return;
    }
    if (leaf.isDebug) {
      console.log('validating leaf', leaf.id, leaf.name, 'with value', leaf.valueOf());
    }
    leaf.validate();
    checked.add(leafId);

    if (leaf.parentId && down) {
      this.validateLeaf(leaf.parentId, checked, down);
    }
  }
}
