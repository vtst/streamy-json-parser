// A lexer for JSON.

import { SyntaxError } from './error.js';

// The types of tokens emitted by the lexer.
export const TOKEN_TYPE = {
  'LITERAL': 1,
  'START_OBJECT': 2,
  'END_OBJECT': 3,
  'START_ARRAY': 4,
  'END_ARRAY': 5,
  'COLON': 6,
  'COMA': 7,
  'START_STRING': 8,
  'STRING_CHUNK': 9,
  'END_STRING': 10
};

const TOKEN_TYPE_NAME = {
  [TOKEN_TYPE.LITERAL]: 'literal value',
  [TOKEN_TYPE.START_OBJECT]: '{',
  [TOKEN_TYPE.END_OBJECT]: '}',
  [TOKEN_TYPE.START_ARRAY]: '[',
  [TOKEN_TYPE.END_ARRAY]: ']',
  [TOKEN_TYPE.COLON]: ':',
  [TOKEN_TYPE.COMA]: ',',
  [TOKEN_TYPE.START_STRING]: '"',
  [TOKEN_TYPE.STRING_CHUNK]: 'string chunk',
  [TOKEN_TYPE.END_STRING]: '"'
};

export function getTokenTypeName(token) {
  return TOKEN_TYPE_NAME[token.type];
}

// Mapping escape sequences to the actual character they represent.
const ESCAPE_SEQUENCES = {
  '"': '\"',
  '\\': '\\',
  '/': '/',
  'b': '\b',
  'f': '\f',
  'n': '\n',
  'r': '\r',
  't': '\t'
};

const ESCAPE_SEQUENCE_ERROR = -1;

// Convert an escape sequence (without the \ prefix) into a character.
// Return null if the escape sequence is not complete and ESCAPE_SEQUENCE_ERROR in case of error.
function getCharFromEscapeSequence(escapeSequence) {
  const value = ESCAPE_SEQUENCES[escapeSequence];
  if (value) {
    // A simple escape sequence like \n or \t.
    return value;
  } else if (escapeSequence.substring(0, 1) == 'u') {
    if (escapeSequence.length == 5) {
      // An unicode escape sequence \u1234
      return String.fromCharCode(parseInt(escapeSequence.substring(1), 16));
    }
  } else {
    return ESCAPE_SEQUENCE_ERROR;
  }
}

// A lexer for JSON strings. The input is given by calling push() (potentially multiple times)
// and close() (once). Lexing happens incrementally, and tokens are pushed in .tokens as they are lexed.
// Tokens are of the following type: {type: TOKEN_TYPE, value: string?}
// Throw SyntaxError in case of error.
export class Lexer {

  // --------------------------------------------------------------------------------
  // The interface for the lexer.

  tokens = [];  // The tokens emitted by the lexer.
  #isClosed = false;  // Whether the lexer has finished lexing the input string.
  #options;

  // Options:
  // * ignore_locations (bool): if true, locations are not tracked.
  constructor(opt_options) {
    this.#options = opt_options || {};
  }

  // Append some text to lex to the input string.
  push(text) {
    if (this.#isClosed) throw 'Cannot push more text to a closed lexer.';
    for (let i = 0; i < text.length; ++i) {
      this.#lexChar(text[i]);
    }
    // Emit a string chunk if stopping in the middle of a string.
    this.#flushString();
  }

  // End the lexing.  Note that a token might be added to .token (in the case
  // where the lexed JSON is a numeric literal.)
  close() {
    this.#isClosed = true;
    this.#flushState();
    if (this.#stringBuffer) this.#throwSyntaxError('Unterminated string');
  }

  reset() {
    this.tokens = [];
    this.#isClosed = false;
  }

  // --------------------------------------------------------------------------------
  // The implementation of the lexer.

  // The buffer for accumulating string content while parsing a JSON string.
  #stringBuffer = null;
  // The buffer for accumulating characters in an escape sequence within a string.
  #escapeSequenceBuffer = null;
  // The buffer for accumulating literal values (true, false, null, or numbers).
  #literalBuffer = null;
  // Tracks if the last character processed was a carriage return (\r).
  #lastCharIsCR = false;
  // The current location in the input stream (index, line and column).
  location = {index: 0, line: 1, column: 0};
  // The location of the first token added in  literalBuffer.
  #literalBufferStartLocation = null;

  #throwSyntaxError(message, opt_location) {
    throw new SyntaxError(opt_location || this.location, message);
  }

  // Convert the literal value that just got lexed into an actual JavaScript value.
  #getLiteralBufferValue() {
    switch (this.#literalBuffer) {
      case 'null': return null;
      case 'true': return true;
      case 'false': return false;
      default:
        const number = Number(this.#literalBuffer);
        if (Number.isFinite(number)) return number;
        this.#throwSyntaxError('Unknown literal value: ' + this.#literalBuffer, this.#literalBufferStartLocation);
    }
  }

  #pushToken(type, opt_value, opt_location) {
    this.tokens.push({
      type,
      location: this.#options.ignore_locations ? undefined : (opt_location || {... this.location}),
      value: opt_value
    });
  }

  // Push a token for what is currently stored in the state, and reset the state.
  #flushState() {
    if (this.#literalBuffer !== null) {
      this.#pushToken(TOKEN_TYPE.LITERAL, this.#getLiteralBufferValue(), this.#literalBufferStartLocation);
      this.#literalBuffer = null;
    }
    if (this.#lastCharIsCR) {
      this.#lastCharIsCR = false;
    }
  }

  // Helper function for flushing state and pushing a token.
  #flushStateAndPushToken(type, opt_value) {
    this.#flushState();
    this.#pushToken(type, opt_value);
  }

  // Push a token for what is stored in the string buffer, and reset it.
  #flushString() {
    if (this.#stringBuffer) {
      this.#pushToken(TOKEN_TYPE.STRING_CHUNK, this.#stringBuffer.join(''));
      this.#stringBuffer = [];
    }
  }

  #updateLocation(char) {
    if (this.#options.ignore_locations) return;
    ++this.location.index;
    ++this.location.column;
    switch (char) {
      case '\r':
        ++this.location.line;
        this.location.column = 0;
        this.#lastCharIsCR = true;
        break;
      case '\n':
        if (!this.#lastCharIsCR) {
          ++this.location.line;
          this.location.column = 0;
        }
      default:
        this.#lastCharIsCR = false;
    }
  }

  // Process a single character of input.
  #lexChar(char) {
    this.#updateLocation(char);
    if (this.#stringBuffer === null) {
      // Outside of a string.
      switch (char) {
        // Special characters
        case '{': this.#flushStateAndPushToken(TOKEN_TYPE.START_OBJECT); break;
        case '}': this.#flushStateAndPushToken(TOKEN_TYPE.END_OBJECT); break;
        case '[': this.#flushStateAndPushToken(TOKEN_TYPE.START_ARRAY); break;
        case ']': this.#flushStateAndPushToken(TOKEN_TYPE.END_ARRAY); break;
        case ',': this.#flushStateAndPushToken(TOKEN_TYPE.COMA); break;
        case ':': this.#flushStateAndPushToken(TOKEN_TYPE.COLON); break;
        // Strings
        case '"':
          this.#flushState();
          this.#stringBuffer = [];
          this.#flushStateAndPushToken(TOKEN_TYPE.START_STRING);
          break;
        case ' ':
        case '\t':
        case '\r':
        case '\n':
          this.#flushState();
          break;
        default:
          if (this.#literalBuffer === null) {
            this.#literalBuffer = char;
            if (!this.#options.ignore_locations) this.#literalBufferStartLocation = {... this.location};
          } else {
            this.#literalBuffer += char;
          }
          break;
      }
    } else if (this.#escapeSequenceBuffer === null) {
      // In a string, outside of an escape sequence.
      switch (char) {
        case '\\':
          this.#flushState();
          this.#escapeSequenceBuffer = [];
          break;
        case '"':
          this.#flushString();
          this.#pushToken(TOKEN_TYPE.END_STRING);
          this.#stringBuffer = null;
          break;
        case '\n':
        case '\r':
        default:
          this.#flushState();
          this.#stringBuffer.push(char);
          break;
      }
    } else {
      // In a string, in an escape sequence.
      if (char == '"' && this.#escapeSequenceBuffer) {
        this.#throwSyntaxError('Incomplete escape sequence: \\' + this.#escapeSequenceBuffer.join(''));
      }
      this.#escapeSequenceBuffer.push(char);
      const value = getCharFromEscapeSequence(this.#escapeSequenceBuffer.join(''));
      if (value == ESCAPE_SEQUENCE_ERROR) {
        this.#throwSyntaxError('Illegal escape sequence: \\' + this.#escapeSequenceBuffer);
      } else if (value) {
        this.#stringBuffer.push(value);
        this.#escapeSequenceBuffer = null;
      }
    }
  }

}
