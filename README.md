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

## filters

Filters are (optional) "cleanup" functions that cleanse or transform candidate values. This can include:

* rounding numeric values 
* removing "junk" characters or padding around string values
* limiting arrays to a maximum size
* asserting default properties on object types

Filters take in the 
