export class SyntaxError extends Error {
  constructor(message, location) {
    super(`Line ${location.line}, column ${location.column}: ${message}`);
    this.name = 'SyntaxError';
    this.location = location;
  }
}
