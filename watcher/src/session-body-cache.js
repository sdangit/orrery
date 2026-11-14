// Watcher-lifetime journal data only. No disk storage or community responses.
// Retain latest scans/signals, but individual organic samples (which are counted).
export function createSessionBodyCache({ maxSystems = 128, maxEventsPerSystem = 10000 } = {}) {
  const systems = new Map();
  return {
    visit(address) {
      const key = String(address);
      const events = systems.get(key) ?? new Map();
      systems.delete(key);
      systems.set(key, events);
      while (systems.size > maxSystems) systems.delete(systems.keys().next().value);
      return events;
    },
    add(events, event) {
      const key = event.event === 'ScanOrganic' ? JSON.stringify(event)
        : `${event.event}:${event.BodyID}`;
      const previous = events.get(key);
      if (previous && Date.parse(previous.timestamp) > Date.parse(event.timestamp)) return;
      events.delete(key);
      events.set(key, event);
      while (events.size > maxEventsPerSystem) events.delete(events.keys().next().value);
    },
    clear() { systems.clear(); },
  };
}
