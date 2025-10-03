export class SyntaxError extends Error {
  constructor(location, message) {
    super(`Line ${location.line}, Column ${location.column}: ${message}`);
    this.name = 'SyntaxError';
    this.location = location;
  }
}
