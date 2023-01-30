import { listenerFactory } from '../utils';
import { Subject } from 'rxjs';

describe('utils', () => {
  describe('listenerFactory', () => {
    describe('parameter list', () => {
      it('should pass valid listeners through', () => {
        const feedback: any[] = [];
        const next = (value: any) => {
          feedback.push({ next: value });
        };
        const error = (err: any) => {
          feedback.push({ error: err });
        };

        const complete = () => {
          feedback.push('complete');
        };

        const subject = new Subject();

        const listener = listenerFactory(next, error, complete);
        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([{ next: 'foo' }]);
        subject.next('bar');
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }, { error: err }]);
      });

      it('should accept incomplete params - no error listener', () => {
        const feedback: any[] = [];
        const next = (value: any) => {
          feedback.push({ next: value });
        };

        const subject = new Subject();

        const listener = listenerFactory(next);

        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([{ next: 'foo' }]);
        subject.next('bar');
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
      });
      it('should accept incomplete params - no listener', () => {
        const feedback: any[] = [];
        const error = (value: any) => {
          feedback.push({ error: value });
        };

        const subject = new Subject();

        const listener = listenerFactory(undefined, error);

        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([]);
        subject.next('bar');
        expect(feedback).toEqual([]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ error: err }]);
      });
    });
    describe('object', () => {
      it('should pass valid listeners through', () => {
        const feedback: any[] = [];
        const next = (value: any) => {
          feedback.push({ next: value });
        };
        const error = (err: any) => {
          feedback.push({ error: err });
        };

        const complete = () => {
          feedback.push('complete');
        };

        const subject = new Subject();

        const listener = listenerFactory({ next, error, complete });
        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([{ next: 'foo' }]);
        subject.next('bar');
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }, { error: err }]);
      });

      it('should accept incomplete params - no error listener', () => {
        const feedback: any[] = [];
        const next = (value: any) => {
          feedback.push({ next: value });
        };

        const subject = new Subject();

        const listener = listenerFactory({ next });

        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([{ next: 'foo' }]);
        subject.next('bar');
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ next: 'foo' }, { next: 'bar' }]);
      });
      it('should accept incomplete params - no listener', () => {
        const feedback: any[] = [];
        const error = (value: any) => {
          feedback.push({ error: value });
        };

        const subject = new Subject();

        const listener = listenerFactory({ error });

        subject.subscribe(listener);
        subject.next('foo');
        expect(feedback).toEqual([]);
        subject.next('bar');
        expect(feedback).toEqual([]);
        const err = new Error('oops');
        subject.error(err);
        expect(feedback).toEqual([{ error: err }]);
      });
    });
  });
  // @TODO: test error trapping
});
