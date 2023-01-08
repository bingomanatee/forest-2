import { Forest } from '../index';

describe('Forest', () => {
  describe('constructor', () => {
    it('has the correct localValue', () => {
      const store = new Forest({ value: { a: 1, b: 2 } });
      expect(store.root.value).toEqual({ a: 1, b: 2 })
    });

    it('includes children', () => {
      const store = new Forest({ value: { a: 1, b: 2 },
        children: {
          c: { value: 3 },
          d: { value: 4 }
        }
      });
      console.log('forest leaves: ', Array.from(store.leaves.values()));
      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
    });
  });
});
