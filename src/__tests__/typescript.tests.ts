import { Forest } from '../index';
import { leafI } from '../types';

describe('Forest', () => {
  describe('typescript', () => {
    it('can type-define an instance', () => {
      type PointValue = {
        x: number,
        y: number,
        value: unknown
      }

      interface PointValueInterface extends leafI {

        value: PointValue,
      }

      const pointValue = new Forest({
        $value: {
          x: 0,
          y: 0,
          value: null
        },
        actions: {
          moveX(leaf: leafI, offset: number) {
            leaf.do.set_x(leaf.value.x + offset);
          }

        }
      }) as PointValueInterface

      pointValue.do.moveX(100);

      expect(pointValue.value.x).toBe(100);
    });
  });
});
