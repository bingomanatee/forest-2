import { TransactionSet } from '@wonderlandlabs/transact';
import { Leaf } from './Leaf';
import { transObj } from '@wonderlandlabs/transact/dist/types';
import { c } from '@wonderlandlabs/collect';
import { childDef, keyName, leafConfig, leafI, listenerType, selectorFn } from './types';
import { distinctUntilChanged, map, Observable, Observer, share, Subscription } from 'rxjs';
import { handlers } from './handlers';
import { commitPipes } from './utils';

export class Forest {
  constructor(rootConfig: leafConfig) {
    this.debug = !!rootConfig.debug;
    this.root = new Leaf(this, { id: 'root', ...rootConfig });
    this.addLeaf(this.root);
    this.trans = new TransactionSet(handlers(this));
    this._updateTransId();
  }

  private _updateTransId() {
    const self = this;
    this.trans.subscribe({
      next(transSet) {
        if (transSet.size === 0) {
          if (self.pendingLeafIds.size > 0) {
            self.commitPending();
          }
        } else {
          self.lastTransId = c(transSet).getReduce((memo: number, trans: transObj) => {
            return Math.max(memo, trans.id);
          }, self.lastTransId) as number;
        }
      },
      error() {},
    });
  }

  public debug = false;
  get fast() {
    return this.root.fast;
  }
  private _commitsObservable?: Observable<any>;

  /*
   this emits the root leaf's value whenever the transacrtions empty.
   */
  get commitsObservable(): Observable<any> {
    if (!this._commitsObservable) {
      //@ts-ignore
      this._commitsObservable = this.trans.pipe(...commitPipes(this));
    }
    return this._commitsObservable;
  }

  private _observable?: Observable<any>;
  public get observable(): Observable<any> {
    if (this.fast) {
      return this.commitsObservable;
    }
    if (!this._observable) {
      this._observable = this.commitsObservable.pipe(distinctUntilChanged(), share());
    }
    return this._observable;
  }

  subscribe(listener: any): Subscription {
    return this.root.subscribe(listener);
  }

  select(listener: any, selector: selectorFn): Subscription {

    return this.root.select(listener, selector);
  }

  public leaves = new Map<string, leafI>();
  public trans: TransactionSet;
  public lastTransId = 0;

  /**
   * shortcut to trams.do
   * @param action:
   * @param args
   */
  dot(action: string, ...args: any[]) {
    return this.trans.do(action, ...args);
  }

  public pendingLeafIds = c(new Set<string>());

  get pendingLeaves() {
    return this.pendingLeafIds.getReduce((memo, id) => {
      const leaf = this.leaves.get(id);
      if (leaf) {
        memo.push(leaf);
      }
      return memo;
    }, []);
  }

  markPending(id: string) {
    this.pendingLeafIds.addAfter(id);
  }

  commitPending() {
    this.pendingLeaves?.forEach((leaf: leafI) => leaf.commitPending());
  }

  unmarkPending(id: string) {
    this.pendingLeafIds.deleteItem(id);
  }

  purgePending(trans: transObj) {
    this.pendingLeaves.forEach((leaf: leafI) => leaf.purgePending(trans));
  }

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  purgeTo(transId: number) {
    this.pendingLeaves.forEach((leaf: leafI) => {
      leaf.purgeAfter(transId);
    });
  }

  /* ---------- ROOT --------------
  root leaf, and it's pass-through methods
  */

  public root: leafI;

  get do() {
    return this.root.do;
  }

  child(key: keyName): leafI | undefined {
    return this.root.child(key);
  }

  children(): childDef[] {
    return this.root.children;
  }

  get value() {
    return this.root?.value;
  }

  set value(newValue) {
    this.root.value = newValue;
  }

  getMeta(key: any) {
    return this.root.getMeta(key);
  }

  set(key: any, value: any): leafI {
    this.root.set(key, value);
    return this.root;
  }

  get store() {
    return this.root.store;
  }
}
