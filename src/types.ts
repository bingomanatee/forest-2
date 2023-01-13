import { transObj } from '@wonderlandlabs/transact/dist/types'
import { collectObj, generalObj } from '@wonderlandlabs/collect/lib/types'

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
  children: childDef[]
  parentId?: string;
  shareChildValues() : void;
  toJSON() : generalObj;
  type: string;
  family: string;
}

export type pending = { trans: transObj, store: collectObj };
export type childDef = { child: leafI, key: any, leafId: string };
export type valueCache = { lastTransId: number, value: any };
export type testFn = (value: any, leaf: leafI) => any;
export type testType = string | string[];
export type testDef = testFn | { type?: boolean | testType };
type configChild = leafConfig | any;
export type leafConfig = {
  $value: any;
  parentId?: string;
  test?: testDef | testDef[];
  name?: leafName;
  children?: { [key: string]: configChild } | Map<any, configChild>
}
