# @wonderlandlabs/forest 2.0

Forest 2.0 is a refactoring of the forest system using
components that have been put into their own libraries: transact,
walrus and collect. 

## What is Forest? 

Forest is an _observable_ state composed of nested `Leaf` instances. Leaves have values 
which are any referencable object, managed by `@wonderlandlabs/collect` wrappers. 

Each Forest has a Root Leaf instance. that instance and the leaf, expose a `value` property
that is actually a reference to the leaf's store - a `Collect` instance. You can change the
Forest('s leaf's) value.

Change leaf state is immediate; 

```javascript

const item = new Forest({$value: {x: 1, y: 3}});
item.subscribe((v) => console.log('--- value is ', v));
// -- value is {x: 1, y: 3}
item.value = {x: 2, y: 4};
// -- value is {x: 2, y: 4}
console.log('item.value', item.value);
// item.value = {x: 2, y: 4};
console.log('item.root.,value', item.root.value);
// item.root.value = {x: 2, y: 4};
```

## Value control and identity

Each Leaf (and the Forest instance) has two properties identifying the nature of its contents;
it uses the `@wonderlandlabs/walrus` system:

| **type**  | **form**  | **family** |
|-----------|-----------|------------|
| undefined | void      | void       |
| null      | void      | void       |
| string    | scalar    | scalar     |
| number    | scalar    | scalar     |
| boolean   | scalar    | scalar     |
| symbol    | scalar    | scalar     |
| array     | array     | container  |
| map       | container | container  |
| object    | container | container  |
| set       | container | container  |
| function  | function  | function   |


* `type` is _not_ equivalent to typeof;  `object` is only equivalent to _true object_ -- it does not include the more specific container types (Map, Array, etc.)
  nor does it include null. 
* `form` merges all "empty" types into a catchall "void" and groups complex grouping types (Map, Object, Set) into a 
  general "container" category. 
* `family` only has four buckets; all the multiple-value types are grouped under "container"

If you do not define tests, leaves can contain any value and the value can be changed from one type to another
without any constraint. This can cause difficulty when for instance you attach child leaves (more later) to a base 
leaf and the leaf type is changed form a container form to a scalar one. 

### validators

in your configuration you can (optional) limit:

* which type(s) you want to allow the Leaf instance to allow (a string, or an array of strings)
* one or more tests you want the Leaf instance to allow (a function or an array of functions)
* you can for brevity set `tests: true` which will snapshot the type of the initial value (after filtering, see below) 
  and requires all following values to equal that type. 

#### custom validators 

There are always those edge cases where validation doesn't "fit" within the type constraints. In that case,
it is best to write your own validator. Your validator will be passed the candidate value and the leaf:

```javascript

const isInteger = (value) => {
  if (!Number.isInteger(value)) throw new Error('number must be an integer');
}

const isWhole = (value) => {
  if (value < 0) {
    throw new Error('numbers must be positive or zero')
  }
};

const isPrime = (value) => {
  if (value <= 1) return;
  for (let divisor = 2; divisor < value; ++divisor) {
    if (!(value / divisor)) {
      throw new Error(`${value} is not a prime number. (divisible by ${divisor})`);
    }
  }
}
const primeNumber = new Forest( {$value: 0, types: 'number', tests: [isInteger, isWhole, isPrime]});

primeNumber.value = 7;

try {
  primeNumber.value = 8;
} catch (err) {
  console.log(err.mesage)
}
// 8 is not a prime number. (divisible by 2)
try {
  primeNumber.value = -8;
} catch (err) {
  console.log(err.mesage)
}
// numbers must be positive or zero
try {
  primeNumber.value = 1.5;
} catch (err) {
  console.log(err.mesage)
}
// number must be an integer
try {
  primeNumber.value = 'a bad value'
} catch (err) {
  console.log(err.mesage)
}
// cannot add value of type string to leaf root (type number)

primeNumber.value = 11;

```

Type constraints, if present, are processed before custom validators. If one custom validators fails,
the other validators are not used; likewise only values that pass the types criteria 
are tested with custom validators. 

The second value passed to custom validators is the leaf itself.

Any validator in a list of tests that fails will preempt subsequent tests. 
Put another way, you can assume that any value passed to a function in a list of validators has passed all previous tests.
A list of tests is essentially a long "and" clause. 

#### failed validation

Validations apply only on _changes_ to their leaf; they are not run on the initial value. 
If a vaildation test returns errors, the _change is rejected_. No update will be broadcast to subscribers, 
an error will be thrown, and the value will be what it was before the change was requested. 

## filters

Filters are (optional) "cleanup" functions that cleanse or transform candidate values. This can include:

* rounding numeric values 
* removing "junk" characters or padding around string values
* limiting arrays to a maximum size
* asserting default properties on object types

Filters occur _before_ validation. If they throw, they will (like a failed validation) "roll back" the 
value's assertion. 

### failing on the initial value

Filters will be applied when the _initial_ value is asserted in the Leaf (and therefore the forest)
constructor; if they throw on the initial value the **entire Forests' construction will fail.**

## Actions

Every Leaf instance  has a `.do` property, that contains actions that can be run on the 
Leaf. The Forest has a shortcut to its root's `.do` property: `myForest.do` === `myForest.root.do`.

This property is a blend of **setters** and **custom actions**. 

### Setters 

Object and Map type Leaf instances have `.do` properties that update the keyed values. 
The setters are based on the _original_ keys of the Leaf instance's values. _if the type of the 
leaf changes, these setters will be removed from the do property_ until the leaf's type is 
changed to an object or Map. So, if an object type is changed to a Map type, it will _still have setters_
but they will change the map's keys. 

Setter methods are in the form of `set_(name)`; keys with un-stringable names will not have setters -- but
will not be errors. (note - this is a breaking change from earlier versions which camelcased setters. this is
to respect identical keys with different casings.)

If you _manually provide_ a method with the same name, it will override the default setter. 
(hint: you can always call `leaf.set(key value)` or `myForest.set(key, value)`.

Setter actions call `myleaf.set(key, value)` and like that method, they can throw if invalid values are submitted.
Setting keys mapped to children will update the entire value of the child leaf. (see below). 

### Custom actions

Custom actions are user-created actions. 

* They may or may not return a value.
* They should (see below) be synchronous.
* They are wrapped in a transaction; if there is an untrapped error, \ 
  all change that occured in the action will be reverted.
* You can call setter actions and custom actions from inside an action. 

```javascript
        const point = new Forest({
          $value: { q: 10, y: 20 }, actions: {
            double(leaf) {
              // @ts-ignore
              for (const [key, value] of leaf.store.iter) {
                leaf.set(key, 2 * value);
              }
            },
           addToEach(leaf, add) {
             for (const [key, value] of leaf.store.iter) {
               leaf.set(key, value + add);
             }
           },
           addAndDouble(leaf, add) {
              leaf.do.addToEach(add);
              leaf.do.double();
           }
          },
          highestValue(leaf) {
            return Math.max(...leaf.store.values);
          }
        });

point.addToEach(100); // note
console.log('offset leaf:', point.value);
// offset leaf: {q: 110, y: 120}
console.log('highest:', point.do.highestValue());
// highest: 120
point.addAndDouble(5);
console.log('final leaf:', point.value);
// final leaf: {q: 230, y: 250}
```

Action arguments are passed into the handler defined in the constructor actions property. 
The leaf itself is passed as the implicit first argument; it can be examined, called, changed,
and you can call actions within actions. 

subscribers will only be sent an updated value 
1. when all actions have completed 
2. and no errors have been thrown

An untrapped error will revert the entire action's activity -- and that of any actions it calls.
so if you do a number of operations and one of them fails your state will be reset to before _any_ 
of the activity within that action was taken.

Within the action, if you examine the leaf's value, it will be _immediately_ updated with the (pending)
values your actions have submitted. 

# Changes, Transactions, and Value Control

The value of Forest is that all changes are submitted in a transactional cycle. At any time, there may be 
multiple pending transactions, and when one of them fails, it, and any pending transactions, will be 
reverted, and the state of the Forest will be that which was in place before the reverted transactions
were submitted. 

Catching errors inside transctionally bound activity can contain the collapsing of pending transactions. 

However, _while there are pending transactions,_ they will be exposed as leaf values **immediately**. These
pending values will not be broadcast to subscribers, but they will be shown as the leaf's value. 

This means you have the most immediate values at all times when you inspect the leaves, **and** your subscribers 
are guaranteed to only receive values that have passed the filter/validation process.  

## Intercepting errors. 

Say you have an append method that adds the arguments to a list. However it throws when the appended value is not a number. 
If you do the appending inside an action and it fails, **no values** will end up being (permanantly) added.
However, if you trap the adding of values, you can resume adding the other numbers 
-- or at least you can keep the ones you addded up to that point. 

the relevant tests:

```javascript

      const makeList = () => new Forest({
        $value: [],
        actions: {
          append(leaf, added) {
            if (typeof added !== 'number') {
              throw new Error('non-numeric value passed to append');
            }
            leaf.value = [...leaf.value, added]
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
              } catch (err) {
                //@ts-ignore
                console.log('appendManyOrStop ending:',val, err.message);
                return;
              }
            }
          },
          appendManyIfGood(leaf, list: any[]) {
            for (const val of list) {
              try {
                leaf.do.append(val);
              } catch (err) {
                //@ts-ignore
                console.log('appendManyOrStop skipping:',val,  err.message);
                // note - will continue with other values
              }
            }
          }
        }
      });
      /*
            error: non-numeric value passed to append
            appendManyOrStop ending: six non-numeric value passed to append
            appendManyOrStop skipping: eight non-numeric value passed to append
       */

      it('should purge ALL changes from an action if there is an uncaught failure', () => {
        const point = makePoint(0, 0, 0, {
          actions: {
            setXYZ(leaf: leafI, x: any, y: any, z: any) {
              leaf.set('x', x);
              leaf.set('y', y);
              leaf.set('z', z);
            }
          }
        });

        point.do.setXYZ(10, 20, 30);
        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });

        let e;
        try {
          point.do.setXYZ(40, 50, 'sixty');
        } catch (err: any) {
          e = err;
        }
        expect(e?.message).toMatch(/cannot add value of type string to leaf root:.* \(type number\)/);
        expect(point.value).toEqual({ x: 10, y: 20, z: 30 });
      });
```

As you can see -- not trapping errors puts you in "all or nothing mode." But, if you trap errors, you can
choose how to handle the failure and contain the problems, retaining all the effort done up to that point.

# Child Leaves

You have the option of defining child leaves; 
these are leaves whose entire values are mapped to keys in the root leaf.

This gives you the option of:
* adding actions to the child Leaf instances
* adding validators to sub-parts of the leaf
* ensuring sub-parts of a leaf are type-locked

Defining a deep schema is optional. It also requires you to keep the parent value to be a container type.
(consider type-locking it, as described in "validators" above). 

Child leaves allow you to, for instance, reuse patterns of convenience such as defining structures for forms,
including error messages, labels, options, etc.

Setting a root value with a key that is mapped to a child will transmit the value downwards to that child. 
similarly, changing a child's value will update the parent appropriately. 

You can nest children to whatever depth you want. 

Children are intended to be stable structural elements -- collections, etc. If you want to create 
structures whose element roster changes regularly, _contain_ those elements in a Leaf but do not make the
changing elements themselves children. 

(future development will allow for better handling of dynamic children. )

## Referencing children

Children are attached to their parents by a reference on the child that has the child id and the key it links to.
From the Child, there is an (optional) parentId that describes the child instance's parent. That being said, 
there is no field in the child that defines _exactly where_ in the parent the child is attached. To reduce
redundancy, this can be found only by exploring the parent's `.childKeys` collection. 

