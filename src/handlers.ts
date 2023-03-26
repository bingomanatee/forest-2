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
      },
      (err: any, trans: transObj) => {
        const leafId = trans.params[0];
        const target = leafMgr.leaves.get(leafId);
        if (target?.isDebug) {
          leafMgr.debug({ name: 'failed set', value: err, error: err });
        }
        throw err;
      },
    ],
    doAction: [
      (trans: transObj, leafId: string, fn: () => void) => {
        trans.meta.set('startingTransId', leafMgr.lastTransId);
        fn();
      },
      (err: any, trans: transObj) => {
        const leafId = trans.params[0];
        const target = leafMgr.leaves.get(leafId);
        if (target?.isDebug) {
          leafMgr.debug({ name: 'failed action', value: err, error: err });
        }
        throw err;
      },
    ],
    setLeafValue: (trans: transObj, leafId: string, value: any) => {
      const target = leafMgr.leaves.get(leafId);
      if (!target) {
        throw new Error('cannot get leaf ' + leafId);
      }
      trans.transactionSet.do('update', leafId, value);
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
          trans.meta.set('backup', target.store.clone().value);
          target.store.set(key, value);
        }
        if (!fromChild && target.parent) {
          trans.transactionSet.do('updateFromChild', target.parentId, leafId);
        }
      },
      (error: any, trans: transObj) => {
        const [leafId] = trans.params;
        const target = leafMgr.leaves.get(leafId);
        if (trans.meta.has('backup')) {
          target?.store.change(trans.meta.get('backup'));
        }
        throw error;
      },
    ],
    update: [
      (trans: transObj, leafId: string, value: any, fromParent?: boolean) => {
        const leaf = leafMgr.leaves.get(leafId);
        if (leaf) {
          trans.meta.set('backup', leaf.store.clone().value);
          const newValue = leaf.filter ? leaf.filter(value, leaf) : value;
          leaf.store.value = newValue;
          leaf.shareChildValues();
          if (!fromParent && leaf.parentId) {
            trans.transactionSet.do('updateFromChild', leaf.parentId, leafId);
          }
        }
      },
      (error: any, trans: transObj) => {
        const [leafId, value] = trans.params;
        const target = leafMgr.leaves.get(leafId);
        if (trans.meta.has('backup')) {
          target?.store.change(trans.meta.get('backup'));
        }
        if (target?.isDebug) {
          leafMgr.debug({ name: 'failed setLeafValue', value: { leafId, value }, error });
        }
        throw error;
      },
    ],
    updateFromChild(trans: transObj, parentId: string, childId: string) {
      const parent = leafMgr.leaves.get(parentId);
      const child = leafMgr.leaves.get(childId);
      if (parent && child && parent.childKeys?.hasKey(childId)) {
        const key = parent.childKeys?.get(childId);
        if (key !== undefined) {
          trans.transactionSet.do('updateFieldValue', parentId, key, child.store.value, true);
        }
        if (parent.parentId) {
          trans.transactionSet.do('updateFromChild', parent.parentId, parentId);
        }
      }
    },
  },
});
