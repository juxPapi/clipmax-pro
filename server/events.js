// Small event bus: the API and the pipeline push progress here, the HTTP layer
// forwards it to the renderer over SSE.

import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(60);

export function emitEvent(type, payload = {}) {
  bus.emit('event', {
    type,
    at: new Date().toISOString(),
    ...payload,
  });
}
