import test from "node:test";
import assert from "node:assert/strict";
import { consumeSseFrames } from "./sse.ts";

test("parses a single text event", () => {
  const buffer = `event: text\ndata: {"delta":"hello"}\n\n`;
  const { events, rest } = consumeSseFrames(buffer);
  assert.equal(rest, "");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "text");
  assert.equal(events[0].data, '{"delta":"hello"}');
});

test("parses interleaved thinking and text events", () => {
  const buffer = [
    "event: thinking",
    'data: {"delta":"considering"}',
    "",
    "event: text",
    'data: {"delta":"hi"}',
    "",
    "",
  ].join("\n");
  const { events, rest } = consumeSseFrames(buffer);
  assert.equal(rest, "");
  assert.deepEqual(events.map((e) => e.event), ["thinking", "text"]);
});

test("buffers an incomplete trailing frame", () => {
  const buffer = `event: text\ndata: {"delta":"abc"}\n\nevent: text\ndata: {"delta":"def"`;
  const { events, rest } = consumeSseFrames(buffer);
  assert.equal(events.length, 1);
  assert.equal(events[0].data, '{"delta":"abc"}');
  assert.match(rest, /event: text/);
});

test("skips heartbeat ping comments", () => {
  const buffer = `: ping\n\nevent: done\ndata: {}\n\n`;
  const { events, rest } = consumeSseFrames(buffer);
  assert.equal(rest, "");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "done");
});

test("returns leftover when no complete frame is available", () => {
  const buffer = `event: text\ndata: {"delta":"partial"}`;
  const { events, rest } = consumeSseFrames(buffer);
  assert.equal(events.length, 0);
  assert.equal(rest, buffer);
});

test("handles multiline data lines joined with newlines", () => {
  const buffer = `event: text\ndata: line1\ndata: line2\n\n`;
  const { events } = consumeSseFrames(buffer);
  assert.equal(events[0].data, "line1\nline2");
});
