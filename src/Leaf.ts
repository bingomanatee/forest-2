import { collectObj, generalObj } from '@wonderlandlabs/collect/lib/types';
import { c } from '@wonderlandlabs/collect';
import { v4 } from 'uuid';
import { transactionSet, transObj } from '@wonderlandlabs/transact/dist/types';
import {
  childDef,
  forestConfig,
  keyName,
  leafConfig,
  leafDoObj,
  leafFnObj,
  leafI,
  leafName,
  selectorFn,
  testFn,
  valueCache,
  valueFilterFn,
} from './types';
import { LeafChild } from './LeafChild';
import isEqual from 'lodash.isequal';
import { BehaviorSubject, distinctUntilChanged, map, Observable, Subject, Subscription } from 'rxjs';
import { commitPipes, initTransManager, listenerFactory } from './utils';
import { TransactionSet } from '@wonderlandlabs/transact';
import { LeafManager } from './LeafManager';

export const LEAF_TYPE = Symbol('LEAF_TYPE');
export const EMPTY_DO = Object.freeze({});

const isLeafConfig = (config: any) => config && typeof config === 'object' && '$value' in config;
const isLeaf = (leaf: any) => leaf && typeof leaf === 'object' && leaf.$isLeaf === LEAF_TYPE;

const setterName = (key: any) => {
  try {
    return `set_${key}`;
  } catch (error) {
    return '';
  }
};

export class Leaf implements leafI {
  constructor(config: leafConfig | any, manager?: forestConfig) {
    const { trans, leafMgr } = manager || initTransManager();
    if (!manager) {
      if (!('id' in config)) {
        config.id = 'root-' + v4();
      }
    }
    this.id = 'id' in config ? config.id : v4();
    if (trans) {
      this.trans = trans;
    }
    this.leafMgr = leafMgr;
    this.leafMgr.addLeaf(this);
    if (!isLeafConfig(config)) {
      config = {
        $value: config,
        test: { type: true },
      };
    }

    const lcConfig = config as leafConfig;
    this.name = lcConfig.name;
    this.parentId = lcConfig.parentId;
    this.store = c(config.filter ? config.filter(lcConfig.$value, this) : lcConfig.$value);
    this.filter = lcConfig.filter;
    this.firstType = this.type;
    this._initTest(lcConfig);

    if (config.children) {
      c(config.children).forEach((def, key: string) => {
        this.addChild(def, key);
      });
    }
    if (lcConfig.meta) {
      c(lcConfig.meta).forEach((value, key) => this.setMeta(key, value));
    }
    this.fast = !!lcConfig.fast;
    this._initDo(config);
    this.originalStore = this.store.clone(true);
    if (config.debug) {
      this.debug = config.debug;
    }
  }

  public debug = false;

  get isDebug() {
    return !!(this.debug || this.parent?.isDebug);
  }

  get debugger(): Subject<generalObj> {
    return this.leafMgr.debugger;
  }

  public id: string;
  public readonly $isLeaf = LEAF_TYPE;
  public fast = false;
  private leafMgr: LeafManager;

  private _test?: testFn | undefined;
  public get test() {
    return (value: any) => (this._test ? this._test(value, this) : undefined);
  }

  public readonly filter?: valueFilterFn;
  public parentId?: string; // links upwards to its parent; changeable
  name?: leafName;

  public readonly originalStore: collectObj;

  // ---------------- subscription
  /*
   this emits the root leaf's value whenever the transacrtions empty.
   */

  _observable?: Observable<any>;
  get observable() {
    if (!this._observable) {
      //@ts-ignore
      this._observable = this.trans.pipe(...commitPipes(this));
    }
    return this._observable;
  }

  subscribe(listener: any): Subscription {
    const safeListener = listenerFactory(listener);
    return this.observable.subscribe(safeListener);
  }

  select(listener: any, selector: selectorFn): Subscription {
    const safeListener = listenerFactory(listener);
    return this.observable.pipe(map(selector), distinctUntilChanged()).subscribe(safeListener);
  }

  // --------------- ACTIONS -------------------
  do: leafFnObj = EMPTY_DO;

  private _fixedSetters: any[] | null = null;
  get fixedSetters(): any[] | null {
    return this._fixedSetters;
  }

  set fixedSetters(value: any[] | null) {
    this._fixedSetters = value;
    this.updateDo(true);
  }

  /** --------------------- _initDo -------------------------
   * compiles a set of actions based on the config file, and
   * (where relevant) the keys to the set collection.
   *
   * NOTE: because some "leaf members" may not initially HAVE all the properties
   * relevant to a leaf, you can DEFINE the keys that you want to create setters for.
   * This may also help reduce the overhead for classes with large numbers of properties,
   * if you don't want to have setters for every darn property.
   *
   * The assumption is made that only objects and maps are reasonable subjects
   * for setter functions.
   *
   * @private
   */
  private actions: leafDoObj = {};
  private setters: leafDoObj = {};

  private _initDo(config: leafConfig) {
    this.actions = {};
    this.setters = {};

    if (config.actions) {
      c(config.actions).forEach((fn, name: string) => {
        this.addAction(name, fn);
      });
    }

    if (config.fixedSetters) {
      this.fixedSetters = config.fixedSetters;
    } else {
      // setting fixedSetters will trigger updateDo automatically
      this.updateDo(true);
    }
  }

  private get canHaveSetters(): boolean {
    return this.type === 'object' || this.type === 'map';
  }

  updateDoSetters() {
    this.setters = {};
    if (this.canHaveSetters) {
      if (this.fixedSetters) {
        // manually specify the setters you want.
        this.fixedSetters.forEach((name) => this.addSet(name));
      } else {
        this.store.keys
          .filter((name) => typeof name === 'string')
          .forEach((name: string | number) => {
            this.addSet(name, true);
          });
        // console.log('_initDo: childKeys = ', this.childKeys.keys);
        this.childKeys?.forEach((_leafId, key) => {
          if (key && typeof key === 'string') {
            this.addSet(key, true);
          }
        });
      }
    }
  }

  updateDo(updateSetters = false) {
    if (updateSetters) {
      this.updateDoSetters();
    }
    if (!this.canHaveSetters) {
      this.do = this.actions;
    } else {
      this.do = { ...this.setters, ...this.actions };
    }
  }

  /**
   * utility function to assert a function to the "do" object.
   *
   * Ordinarily this is done via the cnnfig; but if there is a reason to either
   * (a) update the function or (b) append the function later, you can add an action at any time
   *
   * @param name {string}
   * @param fn {function} a function in the form (leaf: leafI, ...otherArgs). it CAN return a value (AND/OR CHANGE THE LEAF) but doesn't have to
   * @param setter {boolean} whether the function is a setter; and therefore, it may be overridden by a function OF THE SAME NAME that is NOT a setter.
   * @param fromDoInit {boolean} whether the function is part of a loop in fromInit; if not, it reconstitutes the do property immediately .
   */
  addAction(name: any, fn: (...args: any[]) => any, setter = false, fromDoInit = false) {
    if (!(name && typeof name === 'string')) {
      return;
    }
    name = name.trim();
    if (!name) {
      return;
    }
    const self = this;
    const handler = (...args: any[]) => fn(self, ...args);
    try {
      if (setter) {
        this.setters[name] = (...args) => {
          let out;
          self.dot('doAction', self.id, () => (out = handler(...args)), name);
          return out;
        };
      } else {
        this.actions[name] = (...args) => {
          let out;
          self.dot('doAction', self.id, () => (out = handler(...args)), name);
          return out;
        };
      }
    } catch (err) {
      console.warn('cannot set action', name, 'as', fn);
    }

    if (!fromDoInit) {
      this.updateDo();
    }
  }

  private addSet(name: any, fromDoInit = false) {
    if (!(name && typeof name === 'string')) {
      return;
    }
    name = name.trim(); // @TODO: better filtering
    if (!name) {
      return;
    }
    const setter = `set_${name}`;
    if (setter) {
      this.addAction(setter, (leaf: leafI, value: any) => leaf.set(name, value), true, fromDoInit);
    }
  }

  // ------------------ validation --------------------

  public firstType: string;

  private _initTypes(list: testFn[], types: string | string[] | boolean) {
    switch (c(types).type) {
      case 'string':
        list.push((value) => {
          const con = c(value);
          if (con.type !== types) {
            throw new Error(`cannot add value of type ${con.type} to leaf ${this.id} (type ${types})`);
          }
        });
        break;

      case 'boolean':
        if (!types) {
          return;
        }
        list.push((value, leaf: leafI) => {
          const con = c(value);
          if (con.type !== leaf.firstType) {
            throw new Error(`cannot add value of type ${con.type} to leaf ${this.id} (type ${leaf.firstType})`);
          }
        });
        break;

      case 'array':
        list.push((value) => {
          const con = c(value);
          const typeList = types as string[];
          if (!typeList.includes(con.type)) {
            throw new Error(`cannot add value of type ${con.type} to leaf ${this.id} (type ${typeList.join(' or ')})`);
          }
        });

        break;
    }
  }

  _initTests(list: testFn[], tests: testFn | testFn[]) {
    if (Array.isArray(tests)) {
      list.push(...tests);
    } else if (tests) {
      list.push(tests);
    }
  }

  private _initTest(config: leafConfig) {
    const list: testFn[] = [];

    if (config.type) {
      this._initTypes(list, config.type);
    }
    if (config.test) {
      this._initTests(list, config.test);
    }
    switch (list.length) {
      case 0:
        return;
        break;

      case 1:
        this._test = (value) => list[0](value, this);
        break;

      default:
        this._test = (value) => {
          for (const t of list) {
            const out = t(value, this); // can throw
            if (out) {
              throw typeof out === 'string' ? new Error(out) : out;
            }
          }
        };
    }
  }

  validate() {
    if (!this.test) {
      return;
    }
    const value = this.test(this.value);
    if (value) {
      if (typeof value === 'string') {
        throw new Error(value);
      }
      throw value;
    }
  }

  // --------------------- store ----------------------

  /**
   * the value asserted by a transaction (if in a transactional state);
   * or the validated realStore (if not.
   */
  public store: collectObj;

  /* -------------- value passthroughs ------------ */

  _valueCache?: valueCache;

  recompute() {
    delete this._valueCache;
    this.parent?.recompute();
  }

  valueOf() {
    if (!this.hasChildren) {
      return this.store.value;
    }
    const store = this.store.clone();
    this.children.forEach(({ key, child }) => {
      store.set(key, child.value);
    });
    return store.value;
  }

  get value() {
    const store = c(this.store.clone(true).value);
    this.children.forEach(({ key, child }) => {
      store.set(key, child.value);
    });

    if (isEqual(store.value, this._valueCache)) {
      return this._valueCache;
    }

    this._valueCache = store.value;
    return store.value;
  }

  set value(newValue: any) {
    this.dot('setLeafValue', this.id, newValue);
  }

  set(key: any, value: any) {
    if (!(this.family === 'container')) {
      throw new Error(`cannot set field of leaf ${this.id} (type = ${this.type}`);
    }
    this.dot('setLeafFieldValue', this.id, key, value);
    return this;
  }

  get(key: any): any {
    if (!(this.family === 'container')) {
      throw new Error(`cannot get field of leaf ${this.id} (type = ${this.type}`);
    }

    return this.store.get(key);
  }

  get type() {
    return this.store.type;
  }

  get family() {
    return this.store.family;
  }

  /* ----------------- parent/child ----------------- */

  get parent(): leafI | undefined {
    return this.parentId ? this.getLeaf(this.parentId) : undefined;
  }

  /**
   * Children are values of other leaves mapped onto the current leaf.
   */

  /**
   * a decorated map where;
   * - the KEY is the key in the main store that the child represents, and
   * - the VALUE is the child leaf's ID.
   */
  public childKeys?: collectObj;

  get children(): childDef[] {
    if (!this.childKeys) {
      return [];
    }
    return this.childKeys.getReduce((memo, leafId, key) => {
      const child = new LeafChild(this, key, leafId);
      memo.push(child);
      return memo;
    }, []);
  }

  get hasChildren(): boolean {
    return !!this.childKeys?.size;
  }

  child(key: keyName) {
    if (!this.hasChildren) {
      return undefined;
    }
    const childId = this.childKeys?.get(key);
    return childId ? this.getLeaf(childId) : undefined;
  }

  removeChild(key: any) {
    if (!this.hasChildren) {
      return;
    }
    this.childKeys?.deleteKey(key);
    this.store.value = this.store.clone().deleteKey(key);
    const setName = setterName(key);
    if (setName && setName in this.setters) {
      delete this.setters[setName];
      this.updateDo();
    }
  }

  /**
   * embeds a new Leaf as a child of this leaf.
   * Also, registers the leaf with the forest's leaf collection.
   *
   * @param value {Leaf or leafConfig or (any leaf value)}
   * @param key {any} what property in the current leaf will
   *                  hold the value of the child leaf
   */
  addChild(value: any, key: any) {
    if (!(this.store.family === 'container')) {
      throw new Error('cannot join child to a non-container leaf');
    }
    if (!this.childKeys) {
      this.childKeys = c(new Map());
    }

    if (isLeafConfig(value)) {
      // value is a config for a NEW leaf
      if (!('id' in value)) {
        try {
          value.id = `${this.id}:${key}:${v4()}`;
        } catch {
          value.id = `${this.id}:__${v4()}`;
        }
      }
      if (!('name' in value) && ['number', 'string'].includes(c(key).type)) {
        value.name = key;
      }
      value.parentId = this.id;
      const newLeaf = new Leaf({ ...value }, { trans: this.trans, leafMgr: this.leafMgr });

      this.childKeys.set(key, newLeaf.id);
      this.addLeaf(newLeaf);
    } else if (isLeaf(value)) {
      const leaf = value as leafI;
      leaf.name = key;
      leaf.parentId = this.id;
      this.childKeys.set(key, leaf);
      this.addLeaf(leaf);
    } else {
      // value is a "raw" value for a new leaf.
      this.addChild(
        {
          $value: value,
          parentId: this.id,
          name: key,
        },
        key,
      );
      return;
    }
  }

  /* -------------------- pending values ------------------- */

  /**
   * This method writes any values in the current LOCAL value
   * downwards to any named children.
   */
  shareChildValues() {
    for (const { child, leafId, key } of this.children) {
      if (this.store.hasKey(key)) {
        const newChildValue = this.store.get(key); // the pending values' assertion
        if (!child.store.sameValues(child.store.value, newChildValue)) {
          this.dot('update', leafId, newChildValue, true);
        }
      }
    }
  }

  // ------------------- META --------------------

  _meta?: collectObj;

  getMeta(key: any) {
    if (!this.hasMeta(key)) {
      return undefined;
    }
    return this._meta?.get(key);
  }

  hasMeta(key: any) {
    return this._meta ? this._meta.hasKey(key) : false;
  }

  setMeta(key: any, value: any, force = false) {
    if (!force && this.hasMeta(key)) {
      console.warn('meta cannot be overwritten without "forcing" it (third parameter = true)');
      return this;
    }
    if (!this._meta) {
      this._meta = c(new Map());
    }
    this._meta.set(key, value);
    return this;
  }

  // ------------------- utility -------------------

  private get status(): Record<string, any> {
    return {
      id: this.id,
      value: this.valueOf(),
      trans: this._transSummary.map((t: transObj) => t.toJSON()),
    };
  }

  addLeaf(leaf: leafI) {
    this.leafMgr.addLeaf(leaf);
  }

  getLeaf(id: string) {
    return this.leafMgr.leaves.get(id) || undefined;
  }

  private get _transSummary(): transObj[] {
    // @ts-ignore
    const active: Set<transObj> = (this.trans as BehaviorSubject<Set<transObj>>).value;
    const list: transObj[] = [];
    active.forEach((trans: transObj) => {
      list.push(trans);
    });
    return list;
  }

  toJSON() {
    return {
      id: this.id,
      value: this.valueOf(),
      type: this.store.type,
      parentId: this.parentId,
      hasChildren: this.hasChildren,
    };
  }

  /**
   * shortcut to trams.do
   * @param action:
   * @param args
   */
  dot(action: string, ...args: any[]) {
    if (this.isDebug) {
      this.leafMgr.debug({
        type: 'dot',
        action,
        args,
        ...this.status,
      });
    }
    return this.trans.do(action, ...args);
  }

  trans: transactionSet = standinTrans;
}

const standinTrans = new TransactionSet({ handlers: {} });
