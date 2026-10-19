// Shared fake Cordis context for the node:test files.
export function fakeCtx() {
  const sections = []
  const listeners = []
  const warnings = []
  return {
    sections,
    listeners,
    warnings,
    systemPrompt: { section: section => sections.push(section) },
    on: (event, listener) => listeners.push({ event, listener }),
    logger: () => ({ warn: message => warnings.push(message) }),
    listener: event => listeners.find(l => l.event === event)?.listener,
  }
}

export const next = async () => ({ kind: 'allow' })

export function toolCall(callId, name, args) {
  return { type: 'tool/call', seq: 1, time: 1000, data: { turn: 1, step: 1, callId, name, arguments: JSON.stringify(args) } }
}

export function toolResult(callId, text, { isError = false, error } = {}) {
  return {
    type: 'tool/result',
    seq: 2,
    time: 1001,
    data: {
      turn: 1,
      step: 1,
      message: { role: 'tool', toolCallId: callId, isError, content: [{ type: 'text', text }] },
      ...(error ? { error } : {}),
    },
  }
}
