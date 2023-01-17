# Release Notes

## 2.0.0 Release

The 2.0.0 Release represents a major re-coding of Forest. It has several changes based on 
development of parallel modules that "spun off" of Forest to handle specific tasks that got
buried deep into the source of the original 1.x release.

* The general handling of collections (objects, maps, sets, arrays) in a consistent manner
  was moved to @wonderlandlabs/collect. 
* Type sensing and definition was moved to @wonderlandlabs/walrus. 
* Transaction management and change actions was moved to @wonderlandlabs/transact.

Separating these subsystems into their own scopes allows for a more easy to digest set of code.
Also, the utility of these systems was too good to bury in a single module. 

Lastly, the code that makes up Forest is now much easier to parse with these specific systems
split out into their own scopes. 

## Forest and Leaves

The 1.x release didn't actually have a "Forest" component. In development, the transaction manager
became such a significant component that referencing it from a tree of leaves became tedious. 
having a "context" attached to each leaf with the transaction management component being a strong element.

Forests have a defined "root" Leaf instance created on instantiation and (optionally) a set of children. 

it also has a flat collection of all the leaves, keyed by ID. 
