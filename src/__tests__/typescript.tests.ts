import { Forest } from '../index';
import { leafI } from '../types';
import { generalObj } from '@wonderlandlabs/collect/lib/types';

describe('Forest', () => {
  describe('typescript', () => {
    it('can type-define an instance', () => {
      type PointValue = {
        x: number;
        y: number;
        value: unknown;
      };

      interface PointValueInterface extends leafI {
        value: PointValue;
      }

      const pointValue = new Forest({
        $value: {
          x: 0,
          y: 0,
          value: null,
        },
        actions: {
          moveX(leaf: leafI, offset: number) {
            leaf.do.set_x((leaf.valueOf() as generalObj).x + offset);
          },
        },
      }) as PointValueInterface;

      pointValue.do.moveX(100);

      expect((pointValue.valueOf() as generalObj).x).toBe(100);
    });
  });
});
