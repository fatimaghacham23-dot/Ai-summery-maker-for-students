const DEFAULT_LIMIT = 50;

class DebugBuffer {
  constructor(limit = DEFAULT_LIMIT) {
    this.limit = limit;
    this.entries = [];
    this.nextId = 1;
  }

  add(entry) {
    const record = { ...entry, id: this.nextId++ };
    this.entries.push(record);

    if (this.entries.length > this.limit) {
      this.entries.shift();
    }

    return record;
  }

  list() {
    return [...this.entries];
  }

  getById(id) {
    return this.entries.find((entry) => entry.id === id);
  }

  clear() {
    const count = this.entries.length;
    this.entries = [];
    return count;
  }
}

const debugBuffer = new DebugBuffer(
  Number(process.env.DEBUG_BUFFER_LIMIT) || DEFAULT_LIMIT
);

module.exports = {
  DebugBuffer,
  debugBuffer,
};