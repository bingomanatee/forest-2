import { Forest } from '../index';
import { leafI } from '../types';

function watch(forest: leafI) {
  const history: any[] = [];

  forest.subscribe({
    next(value: any) {
      history.push(value);
    },
    error(err: any) {
      console.log('error in sub:', err);
    },
  });
  return history;
}

describe('Forest', () => {
  describe('constructor', () => {
    it('has the correct localValue', () => {
      const store = new Forest({ $value: { a: 1, b: 2 } });
      expect(store.value).toEqual({ a: 1, b: 2 });
    });

    it('includes children', () => {
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: { $value: 3 },
          d: { $value: 4 },
        },
      });

      expect(store.value).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('overrides base value with children values', () => {
      const store = new Forest({
        $value: { a: 1, b: 2, c: 8 },
        children: {
          c: { $value: 3 },
          d: { $value: 4 },
        },
      });

      expect(store.value).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('accepts raw values', () => {
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: 3,
          d: 4,
        },
      });

      expect(store.value).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('accepts nested children', () => {
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: { $value: 3 },
          d: { $value: 4 },
          e: {
            $value: [],
            children: new Map([
              [0, { $value: 100 }],
              [1, { $value: 200 }],
              [2, { $value: 300 }],
            ]),
          },
        },
      });

      expect(store.value).toEqual({
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: [100, 200, 300],
      });
    });
    const nummer = (value = 0) =>
      new Forest({
        $value: value,
        filter: (v: any) => {
          if (typeof v !== 'number') {
            return 0;
          }
          return Math.floor(v);
        },
      });

    it('accepts filters', () => {
      const n = nummer(8.2);
      expect(n.value).toBe(8);

      n.value = 3.333;
      expect(n.value).toEqual(3);
      n.value = '44';
      expect(n.value).toEqual(0);
      n.value = -100.1;
      expect(n.value).toEqual(-101);
    });
  });

  describe('setLeafValue', () => {
    it('should update a field', () => {
      const point = new Forest({ $value: { x: 0, y: 0 } });
      point.set('x', 10);

      expect(point.value).toEqual({ x: 10, y: 0 });
    });
  });

  describe('setting leaf value', () => {
    it('should assign by property', () => {
      const numState = new Forest({ $value: 0 });
      const history: any[] = [];

      const sub = numState.subscribe({
        next(value: any) {
          history.push(value);
        },
        error(err: any) {
          console.log('error in sub:', err);
        },
      });

      numState.value = 10;
      expect(numState.value).toBe(10);
      expect(history).toEqual([0, 10]);

      numState.value = 20;
      expect(history).toEqual([0, 10, 20]);
      if (!numState.trans.closed) {
        sub.unsubscribe();
      }
    });

    describe('unique values', () => {
      it('should suppress non-unique scalars', () => {
        const num = new Forest({ $value: 0 });
        const history = watch(num);
        num.value = 1;
        num.value = 1;
        num.value = 2;
        num.value = 1;
        num.value = 1;
        num.value = 3;

        expect(history).toEqual([0, 1, 2, 1, 3]);
      });
      it('should suppress non-unique objects', () => {
        const point = new Forest({ $value: { x: 0, y: 0 } });
        const history = watch(point);

        point.value = { x: 1, y: 1 };
        point.value = { x: 1, y: 1 }; // redundant -- suppressed
        point.do.set_x(2);
        point.value = { x: 2, y: 1 }; // redundant -- suppressed

        expect(history).toEqual([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ]);
      });
      it('should not suppress non-unique scalars if designated fast', () => {
        const num = new Forest({ $value: 0, fast: true });
        const history = watch(num);
        num.value = 1;
        num.value = 1;
        num.value = 2;
        num.value = 1;
        num.value = 1;
        num.value = 3;

        expect(history).toEqual([0, 1, 1, 2, 1, 1, 3]);
      });
      it('should not suppress non-unique objects if designated fast', () => {
        const point = new Forest({ $value: { x: 0, y: 0 }, fast: true });
        const history = watch(point);

        point.value = { x: 1, y: 1 };
        point.value = { x: 1, y: 1 }; // redundant -- expressed
        point.do.set_x(2);
        point.value = { x: 2, y: 1 }; // redundant -- expressed

        expect(history).toEqual([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 2, y: 1 },
        ]);
      });
    });
  });

  describe('test(validation)', () => {
    describe('type test', () => {
      it('accept test for leaf values', () => {
        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, type: 'number' },
            y: { $value: 0, type: 'number' },
          },
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 });

        let e: any;
        try {
          point.set('y', 'forty');
        } catch (err) {
          e = err;
        }
        expect(e.message).toMatch(/cannot add value of type string to leaf root:.* \(type number\)/);
        // type error causes thrown error;
        // but if trapped you can continue to change

        expect(point.value).toEqual({ x: 10, y: 0 });

        point.set('y', 20);
        expect(point.value).toEqual({ x: 10, y: 20 });
      });
    });
    const isWhole = (n: any) => {
      if (!(typeof n === 'number' && n >= 0)) {
        throw new Error('must be a whole number');
      }
    };
    describe('functional test', () => {
      it('accept test for leaf values', () => {
        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, test: isWhole },
            y: { $value: 0, test: isWhole },
          },
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 });

        let e: any;
        try {
          point.set('y', 'forty');
        } catch (err) {
          e = err;
        }
        expect(e.message).toEqual('must be a whole number');
        // type error causes thrown error;
        // but if trapped you can continue to change

        expect(point.value).toEqual({ x: 10, y: 0 });

        point.set('y', 20);
        expect(point.value).toEqual({ x: 10, y: 20 });
      });
    });
    describe('array of test', () => {
      it('accept test for leaf values', () => {
        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, type: 'number', test: [isWhole] },
            y: { $value: 0, type: 'number', test: [isWhole] },
          },
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 });

        let e: any;
        try {
          point.set('y', 'forty');
        } catch (err) {
          e = err;
        }
        expect(e.message).toMatch(/cannot add value of type string to leaf root:.* \(type number\)/);
        // type error causes thrown error, and value is not changed.
        // if trapped you can continue to change

        expect(point.value).toEqual({ x: 10, y: 0 });
        try {
          point.set('x', -100);
        } catch (err2) {
          e = err2;
        }
        expect(e.message).toEqual('must be a whole number');
        expect(point.value).toEqual({ x: 10, y: 0 });

        point.set('y', 20);
        expect(point.value).toEqual({ x: 10, y: 20 });
      });
    });
  });

  describe('meta', () => {
    const foo = Symbol('foo');

    const makeFooForest = () => new Forest({ $value: { x: 1, y: 1 }, meta: { foo } });

    it('should have foo', () => {
      const fooForest = makeFooForest();
      expect(fooForest.getMeta('foo')).toEqual(foo);
    });

    it('should not allow foo to be overwritten (by default)', () => {
      const fooForest = makeFooForest();
      fooForest.setMeta('foo', Symbol('bar'));
      expect(fooForest.getMeta('foo')).toEqual(foo);
    });

    it('should allow foo to be overwritten (if forced)', () => {
      const fooForest = makeFooForest();
      const bar = Symbol('bar');
      fooForest.setMeta('foo', bar, true);
      expect(fooForest.getMeta('foo')).toEqual(bar);
    });
  });
});
