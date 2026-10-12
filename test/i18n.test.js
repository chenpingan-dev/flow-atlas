import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../src/i18n.js";

test("specific dynamic translations win over a generic placeholder", () => {
  assert.equal(t("Job 1 completed"), "任务 1 已完成");
  assert.equal(t("Job 2 started · active 3"), "任务 2 开始 · 当前并发 3");
  assert.equal(t("Job 01"), "任务 01");
  assert.equal(t("Worker {n}", { n: 3 }), "执行器 3");
  assert.equal(
    t("State transition: open → half-open"),
    "状态变化：熔断 → 恢复中",
  );
});
