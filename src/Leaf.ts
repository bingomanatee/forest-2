import { collectObj, generalObj } from '@wonderlandlabs/collect/lib/types';
import { c } from '@wonderlandlabs/collect';
import { v4 } from 'uuid';
import { Forest } from './Forest';
import { transObj } from '@wonderlandlabs/transact/dist/types';
import {
  childDef,
  keyName,
  leafConfig,
  leafDoObj,
  leafI,
  leafName, listenerType,
  pending, selectorFn,
  testFn,
  valueCache,
  valueFilterFn,
} from './types';
import { LeafChild } from './LeafChild';
import produce, { enableMapSet } from 'immer';
import isEqual from 'lodash.isequal';
import { distinct, distinctUntilChanged, map, Observable, Observer, share, Subscription } from 'rxjs'
import { commitPipes } from './utils'

enableMapSet();

export const LEAF_TYPE = Symbol('LEAF_TYPE');
export const EMPTY_DO = Object.freeze({});

const isLeafConfig = (config: any) => config && typeof config === 'object' && '$value' in config;
const isLeaf = (leaf: any) => leaf && typeof leaf === 'object' && leaf.$isLeaf === LEAF_TYPE;

export class Leaf implements leafI {
  constructor(forest: Forest, config: leafConfig | any) {
    this.id = 'id' in config ? config.id : v4();

    if (!isLeafConfig(config)) {
      config = {
        $value: config,
        test: { type: true },
      };
    }

    const lcConfig = config as leafConfig;
    this.name = lcConfig.name;
    this.forest = forest;
    this.parentId = lcConfig.parentId;
    this.realStore = c(config.filter ? config.filter(lcConfig.$value, this) : lcConfig.$value);
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
  }

  public id: string;
  public readonly $isLeaf = LEAF_TYPE;
  private readonly forest: Forest;
  public fast = false;

  private _test?: testFn | undefined;
  public get test() {
    return (value: any) => (this._test ? this._test(value, this) : undefined);
  }

  public readonly filter?: valueFilterFn;
  public parentId?: string; // links upwards to its parent; changeable
  name?: leafName;

  public readonly originalStore: collectObj;

  // ---------------- subscription

  _observable?: Observable<any>;
  get observable() {
    if (!this._observable) {
      //@ts-ignore
      this._observable = this.forest.trans.pipe(...commitPipes(this))
    }
    return this._observable
  }

  subscribe(listener: Partial<Observer<Set<transObj>>> | ((value: Set<transObj>) => void) | undefined): Subscription {
    if (typeof listener === 'function') {
      return this.subscribe({
        next: listener, error(err) {
          console.log('--- fatal error in forest:',
            err
          )
        }
      })
    }
    return this.observable.subscribe(listener);
  }

  select(listener: listenerType, selector: selectorFn) : Subscription {
    if (typeof listener === 'function') {
      return this.select({
        next: listener,
        error(err) {
          console.log('--- fatal error in forest:', err)
        }
      }, selector);
    }
    return this.observable.pipe(map(selector), distinctUntilChanged(isEqual))
      .subscribe(listener);
  }

  // --------------- ACTIONS -------------------
  do: leafDoObj = EMPTY_DO;

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

    if (this.canHaveSetters) {
      if (config.setKeys) {
        // manually specify the setters you want.
        config.setKeys.forEach((name) => this.addSet(name));
      } else {
        this.store.keys
          .filter((name) => typeof name === 'string' || typeof name === 'number')
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
    this.updateDo();
  }

  private get canHaveSetters(): boolean {
    return this.type === 'object' || this.type === 'map';
  }

  private updateDo() {
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
  addAction(name: string | number, fn: (...args: any[]) => any, setter = false, fromDoInit = false) {
    const self = this;
    const handler = (...args: any[]) => {
      return fn(self, ...args);
    };
    try {
      if (setter) {
        this.setters[name] = (...args) => {
          let out;
          self.forest.dot('doAction', () => (out = handler(...args)), name);
          return out;
        };
      } else {
        this.actions[name] = (...args) => {
          let out;
          self.forest.dot('doAction', () => (out = handler(...args)), name);
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

  private addSet(name: string | number, fromDoInit = false) {
    this.addAction(
      `set_${name}`,
      (leaf: leafI, value: any) => {
        return leaf.set(name, value);
      },
      true,
      fromDoInit,
    );
  }

  // ------------------ validation --------------------

  public firstType: string;

  private _initTypes(list: testFn[], types: string | string[] | boolean) {
    switch (c(types).type) {
      case 'string':
        list.push((value, leaf: leafI) => {
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
        list.push((value, leaf: leafI) => {
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

    if (config.types) {
      this._initTypes(list, config.types);
    }
    if (config.tests) {
      this._initTests(list, config.tests);
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
      console.log('test of ', value, 'returned', value);
    }
    if (value) {
      if (typeof value === 'string') {
        throw new Error(value);
      }
      throw value;
    }
  }

  // --------------------- store ----------------------

  /**
   * realStore is the "established" value of the leaf; a validated, committed value.
   * @private
   */
  private realStore: collectObj;

  /**
   * the value asserted by a transaction (if in a transactional state);
   * or the validated realStore (if not.
   */
  public get store() {
    if (this.pendings?.size) {
      const store = (this.pendings.lastItem as pending).store;
      if (store) {
        return store;
      } else {
        console.warn('pendings has bad reference:', this.pendings.value);
      }
    }
    return this.realStore;
  }

  _localimmer?: any;

  get localValue(): any {
    if (this.family !== 'container') {
      return this.store.value;
    }

    const copy = produce(this.store.value, (draft: any) => {
      return draft;
    });

    if (isEqual(copy, this._localimmer)) {
      return this._localimmer;
    }
    this._localimmer = copy;
    return copy;
  }

  /* -------------- value passthroughs ------------ */

  _valueCache?: valueCache;

  recompute() {
    delete this._valueCache;
    this.parent?.recompute();
  }

  _valueImmer?: any;

  get value() {
    if (!this.hasChildren) {
      return this.localValue;
    }
    // // caching is only used to optimize the blending of child values.
    // if (this._valueCache?.lastTransId === this.forest.lastTransId) {
    //   return this._valueCache.value;
    // }

    const value = produce(this.localValue, (draft: any) => {
      const store = c(draft).clone();
      this.children.forEach(({ key, child }) => {
        store.set(key, child.value);
      });
      return store.value;
    });

    if (isEqual(value, this._valueImmer)) {
      return this._valueImmer;
    }

    this._valueImmer = value;
    return value;
  }

  set value(newValue: any) {
    this.forest.dot('setLeafValue', this.id, newValue);
  }

  set(key: any, value: any) {
    if (!(this.family === 'container')) {
      throw new Error(`cannot set field of leaf ${this.id} (type = ${this.type}`);
    }
    if (this.store.get(key) !== value) {
      this.forest.dot('setLeafFieldValue', this.id, key, value);
    }
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
      const newLeaf = new Leaf(this.forest, { ...value });
      this.childKeys.set(key, newLeaf.id);
      this.forest.addLeaf(newLeaf);
    } else if (isLeaf(value)) {
      const leaf = value as leafI;
      leaf.name = key;
      leaf.parentId = this.id;
      this.childKeys.set(key, leaf);
      this.forest.addLeaf(leaf);
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

  /*
    Pendings is an array of transactionally asserted value substitutes.
    it is an array of pendings.
   */
  public pendings?: collectObj;

  pushPending(value: any, trans: transObj) {
    if (!this.pendings) {
      this.pendings = c([]);
    }
    const type = this.type;
    this.pendings.addAfter({ store: c(value), trans });
    if (this.type !== type) {
      this.updateDo();
    }
    this.forest.markPending(this.id);
  }

  shareChildValues() {
    for (const { child, leafId, key } of this.children) {
      if (this.store.hasKey(key)) {
        const newChildValue = this.store.get(key); // the pending values' assertion
        if (!child.store.sameValues(child.value, newChildValue)) {
          this.forest.dot('update', leafId, newChildValue, true);
        }
      }
    }
  }

  purgePending(trans?: transObj | undefined, fromParent?: boolean) {
    try {
      if (this.pendings) {
        if (trans) {
          this.pendings.filter((pending: pending) => {
            return pending.trans.id < trans.id;
          });
        } else {
          this.pendings.clear();
        }
      }
      delete this._valueCache;
      if (!this.pendings?.size) {
        this.forest.unmarkPending(this.id);
      }
      this.updateDo();
    } catch (err) {
      console.log('error in purgePending: ', err);
    }
  }

  purgeAfter(transId: number) {
    if (this.pendings) {
      this.pendings.filter(({ trans }) => trans.id <= transId);
      if (this.pendings.size === 0) {
        this.purgePending();
      }
    }
    this.parent?.recompute();
  }

  commitPending() {
    this.children.forEach(({ child }) => child.commitPending());
    if (this.pendings?.size) {
      const { store } = this.pendings.lastItem;
      if (store) {
        this.realStore = store;
        delete this._valueCache;
      }
    }
  }

  change(value: any) {
    this.forest.dot('updateLeafValue', this.id, value);
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

  getLeaf(id: string) {
    return this.forest.leaves.get(id) || undefined;
  }

  private get _pendingSummary() {
    return this.pendings?.getMap(({ store, trans }) => {
      return [trans.id, trans.action, store.value];
    });
  }

  toJSON() {
    return {
      id: this.id,
      value: this.value,
      type: this.store.type,
      parentId: this.parentId,
      pendings: this._pendingSummary,
      _immerValue: this._valueImmer,
      hasChildren: this.hasChildren
    };
  }
}
