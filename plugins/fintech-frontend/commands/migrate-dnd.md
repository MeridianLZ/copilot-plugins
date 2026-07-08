---
description: Plan and execute migration off react-beautiful-dnd / @hello-pangea/dnd to @dnd-kit next-gen
argument-hint: [path to scope the migration, defaults to whole repo]
---

Scope: $ARGUMENTS (if empty, scan the whole frontend)

Delegate to the **react-dnd-architect** agent:
1. Inventory every `react-beautiful-dnd` / `@hello-pangea/dnd` / legacy `@dnd-kit` v6 usage with file pointers and interaction type
2. For each, state the next-gen equivalent — call out that `DndContext`/`SortableContext`/`arrayMove` maps to `DragDropProvider` + plugin composition + `useSortable({id, index})`, not a like-for-like swap
3. Order the migration by risk, lowest first; each step independently shippable and testable
4. Flag any interaction that currently lacks a keyboard path — those get fixed during migration, not deferred

Confirm the plan with me before making any edits.
