import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeGraph, scheduleGraph, stateAt } from "../src/graph.js";
const task = (id, duration, deps = []) => ({ id, duration, deps });
const graph = (...tasks) => ({ tasks });

test("critical path and slack distinguish the parallel branch", () => {
  const result = analyzeGraph(
    graph(
      task("a", 2),
      task("b", 5, ["a"]),
      task("c", 1, ["a"]),
      task("d", 3, ["b", "c"]),
    ),
  );
  assert.equal(result.duration, 10);
  assert.equal(result.metrics.get("c").slack, 4);
  assert.equal(result.metrics.get("b").critical, true);
  assert.equal(result.metrics.get("d").level, 2);
});
test("one worker executes exactly the total amount of work", () => {
  const result = scheduleGraph(
    graph(task("a", 2), task("b", 4), task("c", 3, ["a", "b"])),
    1,
  );
  assert.equal(result.makespan, 9);
  assert.equal(result.utilization, 1);
});
test("enough workers attain the dependency lower bound", () => {
  const result = scheduleGraph(
    graph(task("a", 2), task("b", 4), task("c", 3, ["a", "b"])),
    3,
  );
  assert.equal(result.makespan, result.duration);
});
test("simultaneous finishes release all dependencies", () => {
  const result = scheduleGraph(
    graph(task("a", 2), task("b", 2), task("c", 1, ["a", "b"])),
    2,
  );
  assert.equal(result.entries.find((entry) => entry.id === "c").start, 2);
});
test("every scheduled task respects its dependencies and capacity", () => {
  const input = graph(
    task("a", 2),
    task("b", 5),
    task("c", 3, ["a"]),
    task("d", 1, ["a"]),
    task("e", 2, ["b", "c", "d"]),
  );
  const result = scheduleGraph(input, 2);
  const entries = new Map(result.entries.map((entry) => [entry.id, entry]));
  for (const node of input.tasks)
    for (const dep of node.deps)
      assert.ok(entries.get(dep).end <= entries.get(node.id).start);
  for (const a of result.entries)
    for (const b of result.entries) {
      if (a.id !== b.id && a.worker === b.worker)
        assert.ok(a.end <= b.start || b.end <= a.start);
    }
});
test("cycles and unknown dependencies are rejected", () => {
  assert.throws(
    () => analyzeGraph(graph(task("a", 1, ["b"]), task("b", 1, ["a"]))),
    /cycle/,
  );
  assert.throws(
    () => analyzeGraph(graph(task("a", 1, ["missing"]))),
    /unknown/,
  );
  assert.throws(() => analyzeGraph(graph(task("a", 1, ["a"]))), /itself/);
});
test("invalid IDs, durations, labels and dependency lists are rejected", () => {
  for (const input of [
    graph(),
    graph(task("x", 0)),
    graph(task("x", Infinity)),
    graph(task("bad id", 2)),
    graph(task("x", 1), task("x", 2)),
    graph(task("x", 1, ["a", "a"]), task("a", 2)),
    graph({ ...task("a", 1), label: 3 }),
  ])
    assert.throws(() => analyzeGraph(input));
});
test("worker count is bounded", () => {
  for (const count of [0, 17, 1.5])
    assert.throws(() => scheduleGraph(graph(task("x", 1)), count));
});
test("boundary states complete one task before the next starts", () => {
  const result = scheduleGraph(graph(task("a", 2), task("b", 1, ["a"])), 1);
  assert.equal(stateAt(result, 0).get("a"), "running");
  assert.equal(stateAt(result, 0).get("b"), "blocked");
  assert.equal(stateAt(result, 2).get("a"), "complete");
  assert.equal(stateAt(result, 2).get("b"), "running");
  assert.ok(
    [...stateAt(result, 3).values()].every((state) => state === "complete"),
  );
});
test("analysis does not mutate the input graph", () => {
  const input = graph(task("a", 1), task("b", 2, ["a"]));
  const before = JSON.stringify(input);
  scheduleGraph(input, 2);
  assert.equal(JSON.stringify(input), before);
});
test("independent roots receive deterministic worker assignments", () => {
  const input = graph(task("c", 2), task("a", 2), task("b", 2));
  assert.deepEqual(
    scheduleGraph(input, 2).entries.map((entry) => [entry.id, entry.worker]),
    [
      ["a", 0],
      ["b", 1],
      ["c", 0],
    ],
  );
});
