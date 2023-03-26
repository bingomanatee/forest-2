import { leafI } from './types';
import { c } from '@wonderlandlabs/collect';
import { Subject } from 'rxjs'
import { generalObj } from '@wonderlandlabs/collect/lib/types'

export class LeafManager {
  public leaves = new Map<string, leafI>();

  public debugger = new Subject<generalObj>();

  public debug(message: generalObj) {
    console.log('debug: ', message);
    this.debugger.next(message);
  }

  addLeaf(leaf: leafI) {
    this.leaves.set(leaf.id, leaf);
  }

  lastTransId = 0;
}
