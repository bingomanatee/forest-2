import { Forest } from '../index';
import { leafI } from '../types'

describe('Forest', () => {
  describe('actions', () => {
    const double = (leaf: leafI) => {
      leaf.value = 2 * leaf.value;
    };
    const childConfig = (value: number) => ({
      $value: value,
      types: true,
      actions: {
        double
      }
    });

    const makePoint = (x: number, y: number, z: number, updates = {}) => (new Forest({
      $value: {},
      children: {
        x: childConfig(x),
        y: childConfig(y),
        z: childConfig(z)
      },
      ...updates
    }));

    describe('at root', () => {
      const pointFn: () => Forest = () => new Forest({
        $value: { x: 0, y: 0, z: 0 },
        actions: {
          normalize: (leaf) => {
            const mag: number = leaf.do.magnitude();
            if (mag === 0) {
              throw new Error('cannot normalize origin point');
            }
            leaf.do.scale(1 / mag);
          },
          scale: (leaf: leafI, scale: number) => leaf.value = leaf.store.getMap(value => value * scale),
          magnitude: (leaf) => leaf.store.getReduce((mag, value) => mag + (value ** 2), 0) ** 0.5
        }
      });
      const floorN = (n: number, x = 1000) => Math.floor((n * x)) / x;

      it('should return values', () => {
        const point = pointFn();

        expect(point.do.magnitude()).toEqual(0);
        point.set('x', 10);
        expect(point.value).toEqual({ x: 10, y: 0, z: 0 });
        expect(point.do.magnitude()).toEqual(10);

        point.set('y', 10);
        point.set('z', -20);
        expect(Math.floor(point.do.magnitude())).toEqual(Math.floor(((10 ** 2) + (10 ** 2) + ((-20) ** 2)) ** 0.5))
      });

      it('should update value', () => {
        const point = pointFn();

        expect(point.do.magnitude()).toEqual(0);
        point.set('x', 10);
        point.set('y', 10);
        point.set('z', -20);
        point.do.normalize();

        const valueRounded = point.root.store.getMap((num) => floorN(num, 1000));
        expect(valueRounded).toEqual({ x: 0.408, y: 0.408, z: -0.817 })
      })
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

      it('should purge ALL changes from an action if there is an uncaught failure', () => {
        const point = makePoint(0, 0, 0, {
          actions: {
            setXYZ(leaf: leafI, x: any, y: any, z: any) {
              console.log('setXYZ: values = ', x, y, z);
              try {
                console.log('---- setting x ---')
                leaf.set('x', x);
                console.log('---- setting y ---')
                leaf.set('y', y);
                console.log('---- setting z ---')
                leaf.set('z', z);
              } catch (err) {
                console.log('setXYZ error: ', err);
                throw err;
              }
              console.log('END setXYZ: values = ', x, y, z);
            }
          }
        });

        point.subscribe({
          next(value) {
            console.log('>>>>> current value: ', value);
          },
          error(err) {
            console.log('error in sub: ', err);
          }
        });
/*        point.trans.subscribe({
          next(transSet) {
            console.log('current transSet: ---------', Array.from(transSet).map((trans) => ({
                id: trans.id,
                action: trans.action,
                state: trans.state,
                params: trans.params,
              })),
              'leafs:', Array.from(point.leaves.values()).map((l) => JSON.stringify(l.toJSON())));
          },
          error(err) {
            console.log('---- error in sub: ', err);
          }
        })*/

        console.log('======================================== action failure test ======================================== ');
        point.do.setXYZ(10, 20, 30);
        console.log(' END ======================================== action failure test ======================================== ');
        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });

        let e;
        try {
          console.log('-l----- setXYZ 40, 50, sixty');
          point.do.setXYZ(40, 50, 'sixty');
        } catch (err: any) {
          e = err;
        }
        expect(e?.message).toMatch(/cannot add value of type string to leaf root:.* \(type number\)/);

        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });
      });
    });
  });
});
