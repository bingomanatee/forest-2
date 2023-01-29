import { Forest } from '../index';
import { leafI } from '../types';

describe('Forest', () => {
  describe('actions', () => {
    const double = (leaf: leafI) => {
      leaf.value = 2 * leaf.value;
    };
    const childConfig = (value: number) => ({
      $value: value,
      types: true,
      actions: {
        double,
      },
    });

    const makePoint = (x: number, y: number, z: number, updates = {}) =>
      new Forest({
        $value: {},
        children: {
          x: childConfig(x),
          y: childConfig(y),
          z: childConfig(z),
        },
        ...updates,
      });

    describe('at root', () => {
      const pointFn: () => Forest = () =>
        new Forest({
          $value: { x: 0, y: 0, z: 0 },
          actions: {
            normalize: (leaf) => {
              const mag: number = leaf.do.magnitude();
              if (mag === 0) {
                throw new Error('cannot normalize origin point');
              }
              leaf.do.scale(1 / mag);
            },
            scale: (leaf: leafI, scale: number) => (leaf.value = leaf.store.getMap((value) => value * scale)),
            magnitude: (leaf) => leaf.store.getReduce((mag, value) => mag + value ** 2, 0) ** 0.5,
          },
        });
      const floorN = (n: number, x = 1000) => Math.floor(n * x) / x;

      it('should return values', () => {
        const point = pointFn();

        expect(point.do.magnitude()).toEqual(0);
        point.set('x', 10);
        expect(point.value).toEqual({ x: 10, y: 0, z: 0 });
        expect(point.do.magnitude()).toEqual(10);

        point.set('y', 10);
        point.set('z', -20);
        expect(Math.floor(point.do.magnitude())).toEqual(Math.floor((10 ** 2 + 10 ** 2 + (-20) ** 2) ** 0.5));
      });

      it('should update value', () => {
        const point = pointFn();

        expect(point.do.magnitude()).toEqual(0);
        point.set('x', 10);
        point.set('y', 10);
        point.set('z', -20);
        point.do.normalize();

        const valueRounded = point.root.store.getMap((num) => floorN(num, 1000));
        expect(valueRounded).toEqual({ x: 0.408, y: 0.408, z: -0.817 });
      });
    });

    describe('for children', () => {
      it('should allow you to call child actions', () => {
        const point = makePoint(10, 0, -20);
        const child = point.child('x');
        child?.do.double();
        expect(point.value).toEqual({ x: 20, y: 0, z: -20 });
      });
    });

    describe('transactional failures', () => {
      const makeList = () =>
        new Forest({
          $value: [],
          actions: {
            append(leaf, added) {
              if (typeof added !== 'number') {
                throw new Error('non-numeric value passed to append');
              }
              leaf.value = [...leaf.value, added];
            },
            appendMany(leaf, list: any[]) {
              for (const val of list) {
                leaf.do.append(val);
              }
            },
            appendManyOrStop(leaf, list: any[]) {
              for (const val of list) {
                try {
                  leaf.do.append(val);
                } catch (_e) {
                  return;
                }
              }
            },
            appendManyIfGood(leaf, list: any[]) {
              for (const val of list) {
                try {
                  leaf.do.append(val);
                } catch (_e) {
                  // note - will continue with other values
                }
              }
            },
          },
        });
      it('should purge ALL changes from an action if there is an uncaught failure', () => {
        const point = makePoint(0, 0, 0, {
          actions: {
            setXYZ(leaf: leafI, x: any, y: any, z: any) {
              leaf.set('x', x);
              leaf.set('y', y);
              leaf.set('z', z);
            },
          },
        });

        const history: any[] = [];
        point.subscribe((value) => history.push(value));

        point.do.setXYZ(10, 20, 30);
        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });

        let e;
        const beforeErrHistory: any[] = [...history];
        try {
          point.do.setXYZ(40, 50, 'sixty');
        } catch (err: any) {
          e = err;
        }
        expect(history).toEqual(beforeErrHistory);
        expect(e?.message).toMatch(/cannot add value of type string to leaf root:.* \(type number\)/);
        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });
      });

      it('should let you trap the errors and preserve some of the state', () => {
        const list = makeList();
        list.do.appendMany([1, 2, 3]);
        expect(list.value).toEqual([1, 2, 3]);
        try {
          list.do.appendMany([4, 5, 'six']);
        } catch (_e) {
          //@ts-ignore
        }
        expect(list.value).toEqual([1, 2, 3]);

        list.do.appendManyOrStop([4, 5, 'six', 7, 8]);
        expect(list.value).toEqual([1, 2, 3, 4, 5]);
        list.do.appendManyIfGood([6, 7, 'eight', 9, 10]);
        expect(list.value).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
      });
    });

    describe('setters', () => {
      it('should have default setters for known keys', () => {
        const point = new Forest({ $value: { x: 1, y: 2 } });
        point.do.set_x(100);
        point.do.set_y(200);
        expect(point.value).toEqual({ x: 100, y: 200 });
      });

      it('should not change the setters when the keys change', () => {
        const point = new Forest({ $value: { x: 1, y: 2 } });
        point.value = { a: 1, b: 2, c: 3 };
        expect(point.do.set_a).toBeUndefined();
        point.do.set_y(3);
        expect(point.value).toEqual({ a: 1, b: 2, c: 3, y: 3 });
      });

      it('should hide and expose setters depending on the type of the leaf', () => {
        const point = new Forest({
          $value: { q: 10, y: 20 },
          actions: {
            double(leaf) {
              // @ts-ignore
              for (const [key, value] of leaf.store.iter) {
                leaf.set(key, 2 * value);
              }
            },
          },
        });

        point.do.set_q(30);
        point.do.double();
        expect(point.value).toEqual({ q: 60, y: 40 });
        // setting to a scalar -- bye bye setters!
        point.value = 100;
        expect(point.do.set_q).toBeUndefined();
        point.value = new Map();
        point.do.set_q(40);
        // now that point is a "settable" type -- setters reappear.
        expect(point.value).toEqual(new Map([['q', 40]]));
      });
    });

    describe('documentation', () => {
      describe('transactions', () => {
        it('should revert ALL the changes in an action with failed code', () => {
          //  console.log('---------------------- TEST documentation/transactions ---------------');

          const pointValueActions = {
            double: (leaf: leafI) => (leaf.value = 2 * leaf.value),
            halve: (leaf: leafI) => (leaf.value = leaf.value / 2),
          };

          const point = new Forest({
            $value: {},
            children: {
              x: { $value: 0, types: 'number', actions: pointValueActions },
              y: { $value: 0, types: 'number', actions: pointValueActions },
            },
            actions: {
              double(leaf) {
                leaf.child('x')?.do.double();
                leaf.child('y')?.do.double();
              },
              magnitude(leaf) {
                const { x, y } = leaf.value;
                return (x ** 2 + y ** 2) ** 0.5;
              },
              offset(leaf, x, y) {
                leaf.do.set_x(leaf.value.x + x);
                leaf.do.set_y(leaf.value.y + y);
              },
            },
          });

          point.value = { x: 10, y: 20 };
          // console.log('point.magnitude:', point.do.magnitude());
          point.child('x')?.do.double();

          // console.log('---------------------- documentation/transactions ---------------');
          let message = '';
          try {
            point.value = { x: 40, y: 'fifty' };
          } catch (err: any) {
            if (err) {
              message = err.message;
              // console.log('error:', err.message);
            }
          }
          expect(message).toMatch(/cannot add value of type string to leaf .* \(type number\)/);
          // console.log('point.magnitude:', point.do.magnitude());
          point.do.offset(5, 15);
          // console.log('---------------------- END documentation/transactions ---------------');
          // console.log('---------------------- END TEST documentation/transactions ---------------');
        });
      });
    });
  });
});
