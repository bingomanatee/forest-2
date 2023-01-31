import { transObj } from '@wonderlandlabs/transact/dist/types';
import { collectObj, generalObj } from '@wonderlandlabs/collect/lib/types';
import { MonoTypeOperatorFunction, Observable, Observer, Subscription } from 'rxjs';

// -------------- general things

export type pojo = { [key: string | symbol]: any };
export type genFn = (...args: any[]) => any;
// ------------- Leaf related types

export type keyName = string | number;
export type leafName = string | number;
export interface valuable {
  value: any;
  fast?: boolean;
}
export type leafI = {
  id: string;
  name?: leafName;
  $isLeaf: symbol;
  getLeaf(id: string): leafI | undefined;

  purgePending(trans?: transObj | undefined, fromParent?: boolean): void;
  pushPending(value: any, trans: transObj): void;
  pendings?: collectObj;
  purgeAfter(transId: number): void;
  commitPending: () => void;

  store: collectObj;
  originalStore?: collectObj;

  filter?: valueFilterFn;
  test?(value: any): any;
  validate(): void;
  fixedSetters?: any[] | null;

  childKeys?: collectObj; // key = value to replace in leaf, value == string (leafId)
  child(key: keyName): leafI | undefined;
  parent?: leafI;
  children: childDef[];
  parentId?: string;
  shareChildValues(): void;
  addChild(key: any, value: any): void;
  removeChild(key: any): void;

  toJSON(): generalObj;
  type: string;
  firstType: string;
  family: string;
  fast: boolean;

  do: leafFnObj;
  addAction(name: string, action: leafDoFn): void;
  updateDoSetters(setKeys?: any[]): void;
  set(key: any, value: any): leafI;
  get(key: any): any;
  recompute(): void;
  getMeta(key: any): any;
  setMeta(key: any, value: any, force?: boolean): leafI;

  observable: Observable<any>;
  subscribe: (
    listener: Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined,
  ) => Subscription;
  select: (listener: listenerType, selector: selectorFn) => Subscription;
} & valuable;
export type testFn = (value: any, leaf: leafI) => any;
export type leafFn = (...rest: any[]) => any;
export type leafDoFn = (leaf: leafI, ...rest: any[]) => any;
export type valueFilterFn = (value: any, leaf?: leafI) => any;

export type leafDoObj = { [name: string]: leafDoFn };
export type leafFnObj = { [name: string]: leafFn };

export type childDef = { child: leafI; key: any; leafId: string };
export type valueCache = { lastTransId: number; value: any };

// ------------- leaf config

export type pending = { trans: transObj; store: collectObj };
type configChild = leafConfig | any;
export type leafConfig = {
  $value: any;
  id?: string;
  key?: any;
  parentId?: string;
  types?: string | string[] | boolean;
  tests?: testFn | testFn[];
  name?: leafName;
  children?: { [key: string]: configChild } | Map<any, configChild>;
  actions?: leafDoObj;
  setKeys?: string[];
  filter?: valueFilterFn;
  original?: boolean;
  debug?: boolean;
  fast?: boolean;
  meta?: Map<any, any> | generalObj | collectObj;
};

// ------------- RxJS / observable types

export type listenerType = Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined;
export type selectorFn = (value: any) => any;
export type voidFn = () => void;
export type listenerFn = (next: any) => void;
export type mutators = MonoTypeOperatorFunction<any>[];
export type listenerObj = {
  next?: listenerFn;
  error?: listenerFn;
  complete?: voidFn;
};
