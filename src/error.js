export class SyntaxError extends Error {
  constructor(message, location, locationInChunk) {
    super(`Character ${location}: ${message}`);
    this.name = 'SyntaxError';
    this.location = location;  // The character index relative to the start of the stream.
    this.locationInChunk = locationInChunk;  // The character index relative to the current chunk of the stream.
  }
}
