import { Forest } from '../index';

describe('Forest', () => {
  describe('constructor', () => {
    it('has the correct localValue', () => {
      const store = new Forest({ $value: { a: 1, b: 2 } });
      expect(store.root.value).toEqual({ a: 1, b: 2 })
    });

    it('includes children', () => {
      const store = new Forest({ $value: { a: 1, b: 2 },
        children: {
          c: { $value: 3 },
          d: { $value:4 }
        }
      });

      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
    });

    it('accepts raw values', () => {
      console.log('------- raw values');
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: 3,
          d: 4
        }
      });
      console.log('------- END make raw values')

      console.log('--- store root', store.root);
      console.log('forest leaves', Array.from(store.leaves.values()).map(leaf => leaf.toJSON()))

      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
    });

    it('accepts nested children', () => {
      const store = new Forest({ $value:{ a: 1, b: 2 },
        children: {
          c: { $value:3 },
          d: { $value:4 },
          e: {
            $value:[],
            children: new Map([
              [0, {$value:100}],
              [1, {$value:200}],
              [2, {$value:300}]
            ])
          },
        }
      });

      expect(store.root.value)
        .toEqual({
          a: 1, b: 2, c: 3, d: 4, e: [100, 200, 300]
        })
    });
  });
});
