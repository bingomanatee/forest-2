import { leafI } from './types';

/**
 * A class that represents the connection between a leaf and its children
 */
export class LeafChild {
  constructor(private parent: leafI, public key: any, public leafId: string) {}

  get child() {
    return this.parent.getLeaf(this.leafId);
  }
}
