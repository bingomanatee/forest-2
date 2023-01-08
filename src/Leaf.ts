import { collectObj } from '@wonderlandlabs/collect/lib/types'
import { c } from '@wonderlandlabs/collect'
import uuid from './helpers/uuid'
import { Forest } from './Forest'
import { transObj } from '@wonderlandlabs/transact/dist/types'
import { childDef, leafConfig, leafI, leafName, pending, validator, valueCache } from './types'

export class Leaf {
  constructor(forest: Forest, config: leafConfig) {
    this.id = uuid.v4();
    this.name = config?.name;
    this.forest = forest;
    this.parentId = config?.parentId;
    this.realStore = c(config.value);
    if (config.validator) {
      this._validator = config.validator;
    }
    if (config.children) {
      c(config.children).forEach((def, key: string) => {
        console.log('---- adding child:', def, key, 'to', this.id);
        this.addChild(def, key)
      })
    }
  }

  public id: string;
  private forest: Forest;
  private readonly _validator?: validator | validator[] | undefined;
  public parentId?: string;
  name?: leafName;

  get parent(): leafI | undefined {
    return this.parentId ? this.forest.leaves.get(this.parentId) : undefined;
  }


  private doValidate(val: validator) {
    if (typeof val === 'function') {
      const out = val(this.value, this);
      if (out) {
        if (typeof out === 'string') {
          throw new Error(out);
        }
        throw out;
      }
    } else if (val.type) {
      if (Array.isArray(val.type)) {
        if (!val.type.includes(this.realStore.type)) {
          throw new Error('leaf type must be ' + val.type.join(' or '));
        }
      } else {
        if (this.realStore.type !== val.type) {
          throw new Error('leaf.type must be ' + val.type);
        }
      }
    }
  }

  validate() {
    if (!this._validator) {
      return;
    }
    if (Array.isArray(this._validator)) {
      this._validator.forEach((item) => this.doValidate(item));
    } else {
      this.doValidate(this._validator);
    }
  }

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
      return (this.pendings.lastItem as pending).store;
    }
    return this.realStore;
  }

  get localValue(): any {
    return this.store.value;
  }

  _valueCache?: valueCache;

  get value() {
    if (!this.hasChildren) {
      return this.localValue;
    }

    if (this._valueCache?.lastTransId === this.forest.lastTransId) {
      return this._valueCache.value;
    }

    const store = this.realStore.clone();
    this.children.forEach(({ key, child }) => {
      store.set(key, child.value);
    });
    this._valueCache = { value: store.value, lastTransId: this.forest.lastTransId };
    return store.value;
  }

  /**
   * Children are values of other leaves mapped onto the current leaf.
   */

    // collection of leafId => key; where, in the realStore, a child's value is embedded
  public childKeys?: collectObj;

  get children(): childDef[] {
    if (!this.childKeys) {
      return [];
    }
    return this.childKeys.getReduce((memo, key, leafId) => {
      const child = this.forest.leaves.get(leafId);

      if (child) {
        const childSet: childDef = { key, child, leafId };
        memo.push(childSet);
      }
      return memo;
    }, []);
  }

  get hasChildren(): boolean {
    return !!this.childKeys?.size;
  }

  hasChildFor(key: any) {
    return !!this.childKeys?.hasValue(key);
  }

  addChild(config: leafConfig, key: any) {
    if (!(this.store.family === 'container')) {
      throw new Error('cannot join child to a non-container leaf');
    }
    if (!this.childKeys) {
      this.childKeys = c(new Map());
    }

    const leaf = new Leaf(this.forest, { ...config, parentId: this.id });
    this.childKeys.set(leaf.id, key);

    this.forest.addLeaf(leaf);
  }

  /*
    Pendings is an array of transactionally asserted value substitutes.
    it is an array of pendings.
   */
  private pendings?: collectObj;

  pushPending(value: any, trans: transObj) {
    if (!this.pendings) {
      this.pendings = c([]);
    }
    this.pendings.addAfter({ store: c(value), trans });
    this.forest.markPending(this.id);
  }

  shareChildValues() {
    for (const { child, leafId, key } of this.children) {
      if (this.store.hasKey(key)) {
        const newChildValue = this.store.get(key); // the pending values' assertion
        if (!child.store.sameValues(child.value, newChildValue)) {
          this.forest.do('update', leafId, newChildValue, true);
        }
      }
    }
  }

  purgePending(trans?: transObj | undefined, fromParent?: boolean) {
    if (this.pendings) {
      if (trans) {
        this.pendings.filter((pending: pending) => {
          return pending.trans.id < trans.id;
        });
      } else {
        this.pendings.clear();
      }
      if (this.pendings.size === 0) {
        this.forest.unmarkPending(this.id);
      }
    }

    this.children.forEach(({ child }: { child: leafI }) => {
      child.purgePending(trans, true);
    });

    if (!fromParent) {
      this.parent?.purgePending(trans);
    }
  }

  commitPending() {
    if (this.pendings?.size) {
      const { value } = this.pendings.lastItem;
      this.realStore = value;
      this.purgePending();
    }
  }

}
