import { transObj } from '@wonderlandlabs/transact/dist/types';
import { leafI } from './types';
import { LeafManager } from './LeafManager';
import { collectObj } from '@wonderlandlabs/collect/lib/types'
import { c } from '@wonderlandlabs/collect'

export const handlers = (leafMgr: LeafManager) => ({
  handlers: {
    setLeafFieldValue: [
      (trans: transObj, leafId: string, key: any, value: any) => {
        trans.transactionSet.do('updateFieldValue', leafId, key, value);
        trans.transactionSet.do('validatePending');
      },
      (err: any, trans: transObj) => {
        leafMgr.purgePending(trans.id);
        throw err;
      },
    ],
    doAction: [
      (trans: transObj, fn: () => void) => {
        trans.meta.set('startingTransId', leafMgr.lastTransId);
        fn();
      },
      (err: any, trans: transObj) => {
        leafMgr.purgeTo(trans.meta.get('startingTransId'));
        throw err;
      },
    ],
    setLeafValue: [
      (trans: transObj, leafId: string, value: any) => {
        trans.transactionSet.do('update', leafId, value);
        trans.transactionSet.do('validatePending');
      },
      (err: any, trans: transObj) => {
        leafMgr.purgePending(trans.id);
        throw err;
      },
    ],
    validatePending: () => {
      leafMgr.pendingLeaves?.forEach((leaf: leafI) => leaf.validate());
    },
    updateFieldValue: [
      (trans: transObj, leafId: string, key: any, value: any, fromChild?: boolean) => {
        const target = leafMgr.leaves.get(leafId);
        if (!target) {
          throw new Error(`updateFieldValue: cannot find ${leafId}`);
        }
        if (target.childKeys?.hasKey(key)) {
          const childId = target.childKeys.get(key);
          trans.transactionSet.do('update', childId, value, true);
        } else {
          const store = target.store.clone();
          store.set(key, value);
          target.pushPending((store: collectObj) => {
            const newStore = store.clone();
            newStore.set(key, value);
            return newStore;
          }, trans.id);
        }
        if (!fromChild && target.parent) {
          trans.transactionSet.do('updateFromChild', target.parentId, leafId);
        }
      },
      (error: any, trans: transObj) => {
        leafMgr.purgePending(trans.id);
        throw error;
      },
    ],
    update: [
      (trans: transObj, leafId: string, value: any, fromParent?: boolean) => {
        const leaf = leafMgr.leaves.get(leafId);
        if (leaf) {
          const newColl = c(leaf.filter ? leaf.filter(value, leaf) : value);
          leaf.pushPending(() => newColl, trans.id);
          leaf.shareChildValues();
          if (!fromParent && leaf.parentId) {
            trans.transactionSet.do('updateFromChild', leaf.parentId, leafId);
          }
        }
      },
      (error: any, trans: transObj) => {
        // console.log('update: error', error, 'args: ', trans, other);
        leafMgr.purgePending(trans.id);
        throw error;
      },
    ],
    updateFromChild(trans: transObj, parentId: string, childId: string) {
      const parent = leafMgr.leaves.get(parentId);
      const child = leafMgr.leaves.get(childId);
      if (parent && child && parent.childKeys?.hasKey(childId)) {
        const key = parent.childKeys?.get(childId);
        if (key !== undefined) {
          trans.transactionSet.do('updateFieldValue', parentId, key, child.value, true);
        }
        if (parent.parentId) {
          trans.transactionSet.do('updateFromChild', parent.parentId, parentId);
        }
      }
    },
  },
});
