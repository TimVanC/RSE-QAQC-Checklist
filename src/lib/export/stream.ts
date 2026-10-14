/**
 * Helpers that turn the export into a streamed response body. Streaming keeps the response out of the
 * hosting platform's buffered-response size limit and avoids holding the whole file as one string.
 * Pure: no server-only imports, so it is unit tested directly.
 */

const ROWS_PER_CHUNK = 500;

/**
 * JSON text for `{ key: value, ... }` as chunks, with one array element per line so a large dump stays
 * readable and diff-able. Joined, the output is valid JSON identical in meaning to `JSON.stringify(payload)`.
 */
export function* jsonChunks(
  payload: Record<string, unknown>,
  rowsPerChunk: number = ROWS_PER_CHUNK,
): Generator<string, void, undefined> {
  const stringify = (value: unknown) => JSON.stringify(value) ?? 'null';
  yield '{\n';
  let firstKey = true;
  for (const [key, value] of Object.entries(payload)) {
    yield `${firstKey ? '' : ',\n'}${JSON.stringify(key)}:`;
    firstKey = false;
    if (!Array.isArray(value)) {
      yield stringify(value);
      continue;
    }
    yield '[';
    for (let start = 0; start < value.length; start += rowsPerChunk) {
      const batch = value.slice(start, start + rowsPerChunk).map(stringify);
      yield `${start === 0 ? '\n' : ',\n'}${batch.join(',\n')}`;
    }
    yield value.length > 0 ? '\n]' : ']';
  }
  yield '\n}\n';
}

/** Wrap a sequence of string chunks as a UTF-8 byte stream usable as a `Response` body. */
export function toByteStream(chunks: Iterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = chunks[Symbol.iterator]();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    cancel() {
      iterator.return?.();
    },
  });
}
