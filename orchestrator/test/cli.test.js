const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const store = require("../src/store");
const cliRegistry = require("../src/cli-registry");

const cli = path.join(store.ROOT, "src", "cli.js");
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: store.ROOT, encoding: "utf8" });

function main() {
  const discoveryConfig = {
    discoveryIgnoredAdapters: ["gemini", "opencode"],
    agents: {
      "gemini-auto": { adapter: "gemini", cmd: "gemini", autoDiscovered: true },
      "gemini-auto-2": { adapter: "gemini", cmd: "gemini", autoDiscovered: true },
      "custom-opencode": { adapter: "opencode", cmd: "opencode", args: [] },
    },
  };
  const discovered = [
    { id: "gemini", installed: true, command: "gemini", defaultArgs: [], capabilities: [], roleFile: "roles/executor.md" },
    { id: "opencode", installed: true, command: "opencode", defaultArgs: [], capabilities: [], roleFile: "roles/executor.md" },
  ];
  assert.equal(cliRegistry.addMissingAgents(discoveryConfig, discovered), true);
  assert.ok(!discoveryConfig.agents["gemini-auto"]);
  assert.ok(!discoveryConfig.agents["gemini-auto-2"]);
  assert.ok(discoveryConfig.agents["custom-opencode"], "elle eklenen profil korunmali");
  assert.equal(cliRegistry.addMissingAgents({ discoveryIgnoredAdapters: ["gemini"], agents: {} }, discovered.slice(0, 1)), false);

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
