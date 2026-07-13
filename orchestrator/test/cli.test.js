const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const store = require("../src/store");

const cli = path.join(store.ROOT, "src", "cli.js");
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: store.ROOT, encoding: "utf8" });

function main() {
  store.ensureDirs();
  assert.match(run("help"), /cli-team task/);
  assert.equal(run("version").trim(), require("../package.json").version);
  const status = JSON.parse(run("status", "--json"));
  assert.ok(status.queue && Number.isInteger(status.queue.pending));

  const output = run("task", "CLI test gorevi", "--mode", "fast", "--dir", store.ROOT);
  const id = output.match(/Eklendi: (\S+)/)?.[1];
  assert.ok(id);
  const found = store.findTask(id);
  try {
    assert.equal(found.state, "pending");
    assert.equal(found.task.executionMode, "fast");
    assert.equal(found.task.targetDir, store.ROOT);
  } finally {
    store.removeTask("pending", id);
  }

  const approval = { id: `cli-approval-${Date.now()}`, prompt: "test", status: "awaiting-approval", planPreview: "safe" };
  approval.planHash = store.hashText(approval.planPreview);
  store.saveTask("approval", approval);
  try {
    assert.match(run("approve", approval.id), /Onaylandi/);
    assert.equal(store.findTask(approval.id).state, "pending");
  } finally {
    for (const state of ["approval", "pending", "failed"]) store.removeTask(state, approval.id);
  }
  console.log("cli flow ok");
}

main();
