import { Forest } from '../index';

describe('Forest', () => {
  describe('update/subscribe', () => {
    it('should broadcast change to the subscribers', () => {
      const simpleState = new Forest({ $value: { x: 1, y: 2 } });

      const history: any[] = [];

      simpleState.subscribe({
        next(value: any) {
          history.push(value);
        },
        error(err: any) {
          console.log('error in sub:', err);
        },
      });
      expect(history).toEqual([{ x: 1, y: 2 }]);

      simpleState.set('x', 4);
      expect(history).toEqual([
        { x: 1, y: 2 },
        { x: 4, y: 2 },
      ]);

      simpleState.set('y', 3);
      expect(history).toEqual([
        { x: 1, y: 2 },
        { x: 4, y: 2 },
        { x: 4, y: 3 },
      ]);
    });
  });

  describe('subscribe to leaf', () => {
    it('should only update when one corner changes', () => {
      const rect = new Forest({
        $value: {},
        children: {
          tl: {
            $value: {},
            children: { x: 0, y: 0 },
          },
          br: {
            $value: {},
            children: { x: 0, y: 0 },
          },
        },
      });
      const tlHistory: any[] = [];

      rect.child('tl')?.subscribe((value: any) => tlHistory.push(value));

      rect.value = { br: { x: 10, y: 20 } };
      expect(tlHistory).toEqual([{ x: 0, y: 0 }]);

      rect.value = { tl: { x: -10, y: -10 } };
      expect(tlHistory).toEqual([
        { x: 0, y: 0 },
        { x: -10, y: -10 },
      ]);
      expect(rect.valueOf()).toEqual({
        br: {
          x: 10,
          y: 20,
        },
        tl: {
          x: -10,
          y: -10,
        },
      });
    });
  });
});
