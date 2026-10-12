export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.tasks) || graph.tasks.length === 0)
    throw new Error("Add at least one task");
  if (graph.tasks.length > 100)
    throw new Error("The planner supports at most 100 tasks");
  const ids = new Set();
  for (const task of graph.tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,32}$/.test(task.id)
    )
      throw new Error(
        "Task IDs must use letters, numbers, _ or - (max 32 characters)",
      );
    if (ids.has(task.id)) throw new Error(`Duplicate task ID: ${task.id}`);
    ids.add(task.id);
    if (
      task.label !== undefined &&
      (typeof task.label !== "string" || task.label.length > 80)
    )
      throw new Error(`Invalid label for ${task.id}`);
    if (
      !Number.isFinite(task.duration) ||
      task.duration <= 0 ||
      task.duration > 3600
    )
      throw new Error(
        `Duration for ${task.id} must be between 0 and 3600 seconds`,
      );
    if (
      !Array.isArray(task.deps) ||
      task.deps.some((dep) => typeof dep !== "string") ||
      new Set(task.deps).size !== task.deps.length
    )
      throw new Error(`Dependencies for ${task.id} must be unique task IDs`);
  }
  for (const task of graph.tasks) {
    for (const dep of task.deps) {
      if (!ids.has(dep))
        throw new Error(`${task.id} references an unknown task: ${dep}`);
      if (dep === task.id)
        throw new Error(`${task.id} cannot depend on itself`);
    }
  }
  return graph;
}

export function analyzeGraph(graph) {
  validateGraph(graph);
  const tasks = graph.tasks.map((task) => ({
    ...task,
    label: task.label ?? task.id,
    deps: [...task.deps],
  }));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map(tasks.map((task) => [task.id, []]));
  const indegree = new Map(tasks.map((task) => [task.id, task.deps.length]));
  for (const task of tasks)
    for (const dep of task.deps) successors.get(dep).push(task.id);
  const ready = tasks
    .filter((task) => !task.deps.length)
    .map((task) => task.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const child of successors.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) ready.push(child);
    }
  }
  if (order.length !== tasks.length)
    throw new Error("A dependency cycle was detected");
  const metrics = new Map();
  for (const id of order) {
    const task = byId.get(id);
    const start = Math.max(
      0,
      ...task.deps.map((dep) => metrics.get(dep).finish),
    );
    const level = task.deps.length
      ? 1 + Math.max(...task.deps.map((dep) => metrics.get(dep).level))
      : 0;
    metrics.set(id, { start, finish: start + task.duration, level });
  }
  const duration = Math.max(
    ...[...metrics.values()].map((metric) => metric.finish),
  );
  for (const id of [...order].reverse()) {
    const children = successors.get(id);
    const latestFinish = children.length
      ? Math.min(...children.map((child) => metrics.get(child).latestStart))
      : duration;
    const metric = metrics.get(id);
    metric.latestStart = latestFinish - byId.get(id).duration;
    metric.slack = Math.max(0, metric.latestStart - metric.start);
    metric.critical = metric.slack < 1e-8;
    metric.tail =
      byId.get(id).duration +
      Math.max(0, ...children.map((child) => metrics.get(child).tail));
  }
  return { tasks, byId, successors, order, metrics, duration };
}

/** Deterministic list scheduling; this heuristic is not an optimality solver. */
export function scheduleGraph(graph, workerCount = 3) {
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 16)
    throw new Error("Choose between 1 and 16 workers");
  const analysis = analyzeGraph(graph);
  const completed = new Set();
  const started = new Set();
  const active = [];
  const slots = Array(workerCount).fill(null);
  const entries = [];
  let time = 0;
  while (completed.size < analysis.tasks.length) {
    const ready = analysis.tasks
      .filter(
        (task) =>
          !started.has(task.id) && task.deps.every((dep) => completed.has(dep)),
      )
      .sort(
        (a, b) =>
          analysis.metrics.get(b.id).tail - analysis.metrics.get(a.id).tail ||
          a.id.localeCompare(b.id),
      );
    for (let worker = 0; worker < workerCount && ready.length; worker++) {
      if (slots[worker] !== null) continue;
      const task = ready.shift();
      const entry = {
        id: task.id,
        worker,
        start: time,
        end: time + task.duration,
        duration: task.duration,
      };
      slots[worker] = task.id;
      active.push(entry);
      entries.push(entry);
      started.add(task.id);
    }
    if (!active.length) throw new Error("No schedulable task remains");
    time = Math.min(...active.map((entry) => entry.end));
    for (let index = active.length - 1; index >= 0; index--) {
      if (active[index].end <= time) {
        completed.add(active[index].id);
        slots[active[index].worker] = null;
        active.splice(index, 1);
      }
    }
  }
  const work = analysis.tasks.reduce((sum, task) => sum + task.duration, 0);
  return {
    ...analysis,
    entries,
    workerCount,
    makespan: time,
    work,
    utilization: work / (time * workerCount),
  };
}

export function stateAt(schedule, time) {
  const completed = new Set(
    schedule.entries
      .filter((entry) => entry.end <= time)
      .map((entry) => entry.id),
  );
  const running = new Set(
    schedule.entries
      .filter((entry) => entry.start <= time && time < entry.end)
      .map((entry) => entry.id),
  );
  return new Map(
    schedule.tasks.map((task) => [
      task.id,
      completed.has(task.id)
        ? "complete"
        : running.has(task.id)
          ? "running"
          : task.deps.every((dep) => completed.has(dep))
            ? "ready"
            : "blocked",
    ]),
  );
}
