import { Forest } from '../index';
import { leafI, typedDoSelLeaf, typedLeaf, typedSeLeaf } from '../types'

type PointValue = { x: number, y: number }
type PointSel = { magnitude(): number, isNormal(): boolean, badMutator(): 0 }
type PointDo = { set_x(n: number): leafI, set_y(n: number): leafI }
const makePoint = () => new Forest({
  $value: { x: 0, y: 0 },
  selectors: {
    magnitude(leaf: typedLeaf<PointValue>) {
      return Math.sqrt(leaf.value.x ** 2 + leaf.value.y ** 2);
    },
    badMutator(leaf: typedDoSelLeaf<PointValue, PointDo, PointSel>) {
      leaf.do.set_x(leaf.value.x * -1);
      leaf.do.set_y(leaf.value.y * -1);
    },
    isNormal(leaf: typedSeLeaf<PointValue, PointSel>) {
      const mag = leaf.$.magnitude();
      return mag === 1;
    }
  }
});
describe('Forest', () => {
  describe('selectors', () => {
    describe('from constructor', () => {
      it('should return a value from a selector', () => {

        const point = makePoint();

        expect(point.$.magnitude()).toBe(0);
        expect(point.$.isNormal()).toBe(false);
        point.do.set_x(10);
        point.do.set_y(20);
        expect(Math.floor(point.$.magnitude())).toBe(22);
        expect(point.$.isNormal()).toBe(false);
        point.do.set_x(1);
        point.do.set_y(0);
        expect(point.$.isNormal()).toBe(true);

      });
    });

    describe('freezing', () => {

      it('should freeze when freeze is passed', () => {
        const point = makePoint();
        const token = Symbol('token');
        point.freeze(token);
        expect(point.isFrozen).toBeTruthy();
        point.unfreeze(token);
        expect(point.isFrozen).toBeFalsy();
      });

      it.skip('should freeze changes while in place', () => {
        const point = makePoint();
        point.do.set_x(10);
        point.do.set_y(20);
        expect(() => point.$.badMutator()).toThrow();
      })
    });
  });
});
