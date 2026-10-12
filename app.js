import { initLayout } from "./src/layout.js";
import { t, errorText, initI18n } from "./src/i18n.js";
import { scheduleGraph, stateAt } from "./src/graph.js";
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let graph;
let schedule;
let selectedId;
let time = 0;
let playing = false;
let frame;
let previousTime;
const deps = (text) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const seconds = (value) => t("{n} s", { n: Number(value.toFixed(2)) });
function message(text, error = false) {
  $("status").dataset.originalText = text;
  $("status").textContent = t(text);
  $("status").classList.toggle("error", error);
}
function stop() {
  playing = false;
  cancelAnimationFrame(frame);
  $("play").textContent = t("▶ Play");
}
function update(candidate) {
  try {
    const result = scheduleGraph(candidate, Number($("workers").value));
    stop();
    graph = candidate;
    schedule = result;
    time = 0;
    if (!graph.tasks.some((task) => task.id === selectedId))
      selectedId =
        schedule.order.find((id) => schedule.metrics.get(id).critical) ??
        schedule.order[0];
    render();
    message("Valid DAG · deterministic schedule computed locally.");
    return true;
  } catch (error) {
    message(errorText(error), true);
    return false;
  }
}
function render() {
  $("graph-name").textContent = t(
    typeof graph.name === "string" ? graph.name : "Untitled workflow",
  );
  $("stat-tasks").textContent =
    `${graph.tasks.length} / ${graph.tasks.reduce((sum, task) => sum + task.deps.length, 0)}`;
  $("stat-critical").textContent = seconds(schedule.duration);
  $("stat-duration").textContent = seconds(schedule.makespan);
  $("stat-duration-detail").textContent = t(
    "With {n} workers · {s} over lower bound",
    {
      n: schedule.workerCount,
      s: seconds(schedule.makespan - schedule.duration),
    },
  );
  $("stat-utilization").textContent =
    `${Math.round(schedule.utilization * 100)}%`;
  $("scrub").max = schedule.makespan;
  renderGraph();
  renderTimeline();
  renderInspector();
  updateTime();
}
function renderGraph() {
  const levels = new Map();
  for (const id of schedule.order) {
    const level = schedule.metrics.get(id).level;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(id);
  }
  const maxRows = Math.max(
    ...[...levels.values()].map((items) => items.length),
  );
  const height = Math.max(360, maxRows * 108 + 48);
  const width = Math.max(
    levels.size * 180 + 30,
    Math.floor($("graph").parentElement.clientWidth),
  );
  const spacing = levels.size > 1 ? (width - 186) / (levels.size - 1) : 0;
  const positions = new Map();
  for (const [level, ids] of levels)
    ids.forEach((id, index) =>
      positions.set(id, {
        x: levels.size > 1 ? 18 + level * spacing : (width - 150) / 2,
        y: (height - ids.length * 108) / 2 + index * 108 + 12,
      }),
    );
  $("graph").style.minWidth = `${width}px`;
  $("graph").style.height = `${height}px`;
  $("edges").setAttribute("viewBox", `0 0 ${width} ${height}`);
  $("edges").setAttribute("width", width);
  $("edges").setAttribute("height", height);
  const wires = document.createDocumentFragment();
  for (const task of schedule.tasks)
    for (const dep of task.deps) {
      const start = positions.get(dep),
        end = positions.get(task.id);
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      const x1 = start.x + 150,
        y1 = start.y + 43,
        x2 = end.x,
        y2 = end.y + 43;
      const critical =
        schedule.metrics.get(dep).critical &&
        schedule.metrics.get(task.id).critical &&
        Math.abs(
          schedule.metrics.get(dep).finish -
            schedule.metrics.get(task.id).start,
        ) < 1e-8;
      path.setAttribute(
        "d",
        `M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}`,
      );
      path.setAttribute("class", critical ? "wire critical" : "wire");
      wires.append(path);
    }
  $("edges").replaceChildren(wires);
  const nodes = document.createDocumentFragment();
  for (const task of schedule.tasks) {
    const metric = schedule.metrics.get(task.id);
    const position = positions.get(task.id);
    const button = el(
      "button",
      `node ${metric.critical ? "critical" : ""} ${task.id === selectedId ? "selected" : ""}`,
    );
    button.id = `node-${task.id}`;
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.setAttribute(
      "aria-label",
      `${t(task.label)}, ${seconds(task.duration)}${metric.critical ? ", " + t("Critical path") : ""}`,
    );
    button.append(
      el("span", "node-id", task.id),
      el("strong", "node-label", t(task.label)),
    );
    const bottom = el("span", "node-bottom");
    bottom.append(
      el("span", "", seconds(task.duration)),
      el("span", "node-status", t("ready")),
    );
    button.append(bottom);
    button.addEventListener("click", () => {
      selectedId = task.id;
      for (const node of $("nodes").children)
        node.classList.toggle("selected", node.id === `node-${selectedId}`);
      renderInspector();
      updateTime();
    });
    nodes.append(button);
  }
  $("nodes").replaceChildren(nodes);
}
function renderInspector() {
  const task = graph.tasks.find((task) => task.id === selectedId);
  const metric = schedule.metrics.get(selectedId);
  $("task-id").textContent = task.id;
  $("edit-label").value = task.label ?? task.id;
  $("edit-duration").value = task.duration;
  $("edit-deps").value = task.deps.join(", ");
  $("task-start").textContent = seconds(metric.start);
  $("task-slack").textContent = seconds(metric.slack);
  $("task-critical").textContent = t(metric.critical ? "Yes" : "No");
  $("task-critical").className = metric.critical ? "green" : "";
}
function renderTimeline() {
  const fragment = document.createDocumentFragment();
  for (let worker = 0; worker < schedule.workerCount; worker++) {
    const lane = el("div", "lane");
    lane.append(el("span", "lane-label", t("Worker {n}", { n: worker + 1 })));
    const track = el("div", "track");
    for (const entry of schedule.entries.filter(
      (entry) => entry.worker === worker,
    )) {
      const button = el(
        "button",
        "bar" + (schedule.metrics.get(entry.id).critical ? " critical" : ""),
        entry.id,
      );
      button.style.left = `${(entry.start / schedule.makespan) * 100}%`;
      button.style.width = `${(entry.duration / schedule.makespan) * 100}%`;
      button.title = `${entry.id}: ${seconds(entry.start)} → ${seconds(entry.end)}`;
      button.addEventListener("click", () => {
        selectedId = entry.id;
        renderInspector();
        renderGraph();
        updateTime();
      });
      track.append(button);
    }
    track.append(el("div", "playhead"));
    lane.append(track);
    fragment.append(lane);
  }
  $("lanes").replaceChildren(fragment);
  $("scale").replaceChildren(
    ...[0, 0.25, 0.5, 0.75, 1].map((part) =>
      el("span", "", seconds(part * schedule.makespan)),
    ),
  );
}
function updateTime() {
  const states = stateAt(schedule, time);
  $("time").textContent = `${time.toFixed(1)} / ${seconds(schedule.makespan)}`;
  $("scrub").value = time;
  let complete = 0,
    running = 0;
  for (const [id, state] of states) {
    const button = $(`node-${id}`);
    button.dataset.state = state;
    button.querySelector(".node-status").textContent = t(state);
    if (state === "complete") complete++;
    if (state === "running") running++;
  }
  for (const head of document.querySelectorAll(".playhead"))
    head.style.left = `${(time / schedule.makespan) * 100}%`;
  $("completed").textContent = t("{n} / {total} complete", {
    n: complete,
    total: graph.tasks.length,
  });
  $("graph-state").textContent = t("{running} running · {complete} complete", {
    running,
    complete,
  });
  $("task-state").textContent = t(states.get(selectedId));
}
function tick(timestamp) {
  if (!playing) return;
  if (previousTime !== undefined)
    time = Math.min(
      schedule.makespan,
      time + ((timestamp - previousTime) / 1000) * Number($("speed").value),
    );
  previousTime = timestamp;
  updateTime();
  if (time >= schedule.makespan) {
    stop();
    message("Simulation complete.");
    return;
  }
  frame = requestAnimationFrame(tick);
}
async function loadSample() {
  try {
    const response = await fetch(`examples/${$("sample").value}.json`);
    if (!response.ok) throw new Error("Unable to load example");
    update(await response.json());
  } catch (error) {
    message(errorText(error), true);
  }
}
$("play").addEventListener("click", () => {
  if (!schedule) return;
  if (playing) {
    stop();
    return;
  }
  if (time >= schedule.makespan) time = 0;
  previousTime = undefined;
  playing = true;
  $("play").textContent = t("Ⅱ Pause");
  frame = requestAnimationFrame(tick);
});
$("rewind").addEventListener("click", () => {
  if (!schedule) return;
  stop();
  time = 0;
  updateTime();
});
$("scrub").addEventListener("input", () => {
  if (!schedule) return;
  stop();
  time = Number($("scrub").value);
  updateTime();
});
$("workers").addEventListener("change", () => {
  if (graph) update(graph);
});
$("sample").addEventListener("change", loadSample);
$("reset").addEventListener("click", loadSample);
$("edit-task").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!graph) return;
  const candidate = {
    ...graph,
    tasks: graph.tasks.map((task) =>
      task.id === selectedId
        ? {
            ...task,
            label: $("edit-label").value,
            duration: Number($("edit-duration").value),
            deps: deps($("edit-deps").value),
          }
        : task,
    ),
  };
  update(candidate);
});
$("remove").addEventListener("click", () => {
  if (!graph) return;
  update({
    ...graph,
    tasks: graph.tasks
      .filter((task) => task.id !== selectedId)
      .map((task) => ({
        ...task,
        deps: task.deps.filter((dep) => dep !== selectedId),
      })),
  });
});
$("add").addEventListener("click", () => {
  if (!graph) return;
  $("new-error").textContent = "";
  $("add-dialog").showModal();
  $("new-id").focus();
});
$("cancel").addEventListener("click", () => $("add-dialog").close());
$("new-task").addEventListener("submit", (event) => {
  event.preventDefault();
  const task = {
    id: $("new-id").value.trim(),
    label: $("new-label").value.trim(),
    duration: Number($("new-duration").value),
    deps: deps($("new-deps").value),
  };
  if (update({ ...graph, tasks: [...graph.tasks, task] })) {
    selectedId = task.id;
    renderInspector();
    renderGraph();
    updateTime();
    $("add-dialog").close();
    $("new-task").reset();
  } else $("new-error").textContent = $("status").textContent;
});
$("export").addEventListener("click", () => {
  if (!graph) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(graph, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = el("a");
  link.href = url;
  link.download = "workflow.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 256 * 1024)
      throw new Error("Workflow files must be under 256 KiB");
    update(JSON.parse(await file.text()));
  } catch (error) {
    message(errorText(error), true);
  }
});
loadSample();

initLayout();
let lastGraphWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.floor(entry.contentRect.width);
  if (schedule && width !== lastGraphWidth) {
    lastGraphWidth = width;
    renderGraph();
    updateTime();
  }
}).observe($("graph").parentElement);
initI18n(() => {
  if (schedule) {
    const draft = ["edit-label", "edit-duration", "edit-deps"].map(
      (id) => $(id).value,
    );
    render();
    ["edit-label", "edit-duration", "edit-deps"].forEach(
      (id, index) => ($(id).value = draft[index]),
    );
    $("play").textContent = t(playing ? "Ⅱ Pause" : "▶ Play");
  }
  if ($("status").dataset.originalText)
    $("status").textContent = t($("status").dataset.originalText);
});
