// SSE frame parser shared by the co-pilot streaming hook.
// Splits an accumulating buffer on blank-line boundaries and returns
// the parsed events along with whatever incomplete tail is left over.

export interface SSEEvent {
  event: string;
  data: string;
}

export function consumeSseFrames(buffer: string): {
  events: SSEEvent[];
  rest: string;
} {
  const events: SSEEvent[] = [];
  let rest = buffer;
  for (;;) {
    const idx = rest.indexOf("\n\n");
    if (idx === -1) break;
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (!frame.trim() || frame.startsWith(":")) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}
