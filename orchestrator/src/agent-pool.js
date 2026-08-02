const { spawn } = require("child_process");
const cliRegistry = require("./cli-registry");

const POOL = new Map();

class AgentPool {
  constructor() {
    this.maxPoolSize = 3;
  }

  getPoolKey(adapter, command) {
    return `${adapter}:${command}`;
  }

  acquire(adapter, command, env, cwd) {
    const key = this.getPoolKey(adapter, command);
    const existing = POOL.get(key);
    if (existing && existing.child && !existing.child.killed && existing.idle) {
      existing.idle = false;
      existing.lastUsedAt = Date.now();
      return existing;
    }
    return null;
  }

  release(poolItem) {
    if (!poolItem) return;
    poolItem.idle = true;
    poolItem.lastUsedAt = Date.now();
  }

  destroy(poolItem) {
    if (!poolItem) return;
    try {
      if (poolItem.child && !poolItem.child.killed) {
        poolItem.child.kill("SIGTERM");
      }
    } catch {}
    const key = poolItem.key;
    if (POOL.get(key) === poolItem) {
      POOL.delete(key);
    }
  }

  clear() {
    for (const item of POOL.values()) {
      this.destroy(item);
    }
    POOL.clear();
  }
}

module.exports = new AgentPool();
