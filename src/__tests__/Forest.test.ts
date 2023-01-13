import { Forest } from '../index';

describe('Forest', () => {
  describe('constructor', () => {
    it('has the correct localValue', () => {
      const store = new Forest({ $value: { a: 1, b: 2 } });
      expect(store.root.value).toEqual({ a: 1, b: 2 })
    });

    it('includes children', () => {
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: { $value: 3 },
          d: { $value: 4 }
        }
      });

      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
    });

    it('overrides base value with children values', () => {
      const store = new Forest({
        $value: { a: 1, b: 2, c: 8 },
        children: {
          c: { $value: 3 },
          d: { $value: 4 }
        }
      });

      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
    });

    it('accepts raw values', () => {
      const store = new Forest({
        $value: { a: 1, b: 2 },
        children: {
          c: 3,
          d: 4
        }
      });

      expect(store.root.value).toEqual({ a: 1, b: 2, c: 3, d: 4 })
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
              [2, { $value: 300 }]
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

  describe('setLeafValue', () => {
    it('should update a field', () => {
      const point = new Forest({ $value: { x: 0, y: 0 } });
      point.set('x', 10);

      expect(point.value).toEqual({ x: 10, y: 0 })

    });
  });

  describe('update/subscribe', () => {
    it('should broadcast change to the subscribers', () => {

      const simpleState = new Forest({ $value: { x: 1, y: 2 } });
      const history: any[] = [];

      simpleState.subscribe((value) => history.push(value));
      expect(history).toEqual([{ x: 1, y: 2 }]);
      simpleState.set('x', 4);
      expect(history).toEqual([{ x: 1, y: 2 }, { x: 4, y: 2 }])
      simpleState.set('y', 3);
      expect(history).toEqual([{ x: 1, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 3 }])
    });
  });


  describe('tests', () => {
    describe('type tests', () => {
      it('accept tests for leaf values', () => {

        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, test: { type: 'number' } },
            y: { $value: 0, test: { type: 'number' } },
          }
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 })

        let e: any;
        try {
          point.set('y', 'forty');
        } catch (err) {
          e = err;
        }
        expect(e.message).toEqual('leaf string type must be number');
        // type error causes thrown error;
        // but if trapped you can continue to change

        expect(point.value).toEqual({ x: 10, y: 0 });

        point.set('y', 20);
        expect(point.value).toEqual({ x: 10, y: 20 });
      });
    });
    const isWhole = (n: any) => {
      if (!((typeof n === 'number') && (n >= 0))
      ) {
        throw new Error('must be a whole number')
      }
    };
    describe('functional tests', () => {

      it('accept tests for leaf values', () => {

        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, test: isWhole },
            y: { $value: 0, test: isWhole },
          }
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 })

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
    describe('array of tests', () => {
      it('accept tests for leaf values', () => {

        const point = new Forest({
          $value: { x: 0, y: 0 },
          children: {
            x: { $value: 0, test: [ {type: 'number'}, isWhole] },
            y: { $value: 0, test: [{type: 'number'}, isWhole] },
          }
        });
        point.set('x', 10);

        expect(point.value).toEqual({ x: 10, y: 0 })

        let e: any;
        try {
          point.set('y', 'forty');
        } catch (err) {
          e = err;
        }
        expect(e.message).toEqual('leaf string type must be number');
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
});
