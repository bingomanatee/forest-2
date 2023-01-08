import { transObj } from '@wonderlandlabs/transact/dist/types'
import { collectObj } from '@wonderlandlabs/collect/lib/types'

export type leafName = string | number;
export type leafI = {
  value: any;
  purgePending: (trans?: transObj | undefined, fromParent?: boolean) => void;
  pushPending: (value: any, trans: transObj) => void;
  commitPending: () => void;
  store: collectObj;
  id: string;
  name?: leafName;
  validate(): void;
  hasChildFor(key: any): boolean;
  childKeys?: collectObj;
  parent?: leafI;
  children: childDef[];
  parentId?: string;
  shareChildValues() : void;
}

export type pending = { trans: transObj, store: collectObj };
export type childDef = { child: leafI, key: any, leafId: string };
export type valueCache = { lastTransId: number, value: any };
export type validatorFn = (value: any, leaf: leafI) => any;
export type validator = validatorFn | { type?: string | string[] }
type configChild = leafConfig;
export type leafConfig = {
  value: any;
  parentId?: string;
  validator?: validator | validator[];
  name?: leafName;
  children?: { [key: string]: configChild }
}
