import { transObj } from '@wonderlandlabs/transact/dist/types'
import { leafI } from './types'
import { Forest } from './Forest'

export const handlers = (self: Forest) => ({
  handlers: {
    setLeafFieldValue: [
      (trans: transObj, leafId: string, key: any, value: any) => {
        self.dot('updateFieldValue', leafId, key, value);
        self.dot('validatePending');

      },
      (err: any, trans: transObj, ...other: any[]) => {
        self.purgePending(trans);
        throw err;
      }
    ],
    doAction: [
      (trans: transObj, fn: () => void) => {
        trans.meta.set('startingTransId', self.lastTransId);
        console.log('starting action', trans.params, 'at', self.lastTransId);
        fn();

      }, (err: any, trans: transObj) => {
        console.log('>>>>>>>>>>>>>>>>>>>>>>> failure on trans', trans.id, 'purging after', trans.meta.get('startingTransId'))
        self.purgeTo(trans.meta.get('startingTransId'));
        throw err;
      }],
    setLeafValue: [
      (trans: transObj, leafId: string, value: any) => {
        self.dot('update', leafId, value);
        self.dot('validatePending');

      },
      (err: any, trans: transObj, ...other: any[]) => {
        self.purgePending(trans);
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
        if (target.childKeys?.hasKey(key)) {
          const childId = target.childKeys.get(key);
          self.dot('update', childId, value, true);
        } else {
          const store = target.store.clone();
          store.set(key, value);
          target.pushPending(store, trans);
        }
        if (!fromChild && target.parent) {
          self.dot('updateFromChild', target.parentId, leafId);
        }

      },
      (error: any, trans: transObj) => {
        self.purgePending(trans);
        throw error;
      }
    ]
    ,
    update: [
      (trans: transObj, leafId: string, value: any, fromParent?: boolean) => {
        const leaf = self.leaves.get(leafId);
        if (leaf) {
          leaf.pushPending(leaf.filter ? leaf.filter(value, leaf) : value, trans);
          leaf.shareChildValues();
          if (!fromParent && leaf.parentId) {
            self.trans.do('updateFromChild', leaf.parentId, leafId);
          }
        }

      },
      (error: any, trans: transObj, ...other: any[]) => {
        // console.log('update: error', error, 'args: ', trans, other);
        self.purgePending(trans);
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
          self.dot('updateFieldValue', parentId, key, child.value, true);
        }
        if (parent.parentId) {
          self.trans.do('updateFromChild', parent.parentId, parentId);
        }
      }

    }
  }
})
