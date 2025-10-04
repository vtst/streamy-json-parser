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

export function getTokenTypeName(tokenType) {
  return TOKEN_TYPE_NAME[tokenType];
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

const MODE = {
  MAIN: 1,
  STRING: 2,
  ESCAPE_SEQUENCE: 3
};

// A lexer for JSON strings. The input is given by calling push() (potentially multiple times)
// and close() (once). Lexing happens incrementally, and tokens are pushed in .tokens as they are lexed.
// Tokens are of the following type: {type: TOKEN_TYPE, value: string?}
// Throw SyntaxError in case of error.
export class Lexer {

  // --------------------------------------------------------------------------------
  // The interface for the lexer.

  constructor() {
    this.reset();
  }

  // These fields are used as output for the lex, flush and close functions.
  numberOfTokens = 0;
  tokenTypes = [null, null];
  tokenValues = [null, null];

  lex(char) {
    this.numberOfTokens = 0;
    this.#lex(char);
  }

  flush() {
    this.numberOfTokens = 0;
    this.#flushString();
  }

  close() {
    this.numberOfTokens = 0;
    this.#flushState();
    if (this.#mode !== MODE.MAIN) this.throwSyntaxError('Unterminated string');
  }

  reset() {
    this.#mode = MODE.MAIN;
    this.#stringBuffer = [];
    this.#literalBuffer = null;
    this.#escapeSequenceBuffer = [];
    this.#location = {index: 0, line: 1, column: 0};
    this.#lastLineLength = 0;
    this.#lastCharIsCR = false;
  }

  // --------------------------------------------------------------------------------
  // The implementation of the lexer.

  // The current state of lexing.
  #mode;
  // The buffer for accumulating string content while parsing a JSON string.
  #stringBuffer;
  // The buffer for accumulating characters in an escape sequence within a string.
  #escapeSequenceBuffer;
  // The buffer for accumulating literal values (true, false, null, or numbers).
  #literalBuffer;
  // The current location in the input stream
  #location;
  // The length of the last line.
  #lastLineLength;
  // True if the last character was a \r.
  #lastCharIsCR;

  throwSyntaxError(message, opt_location) {
    let location = opt_location === undefined ? this.#location : opt_location;
    throw new SyntaxError(message, location, location);
  }

  #getLocationMinusColumns(numberOfColumns) {
    if (numberOfColumns <=  this.#location.column) {
      return {... this.#location, column: this.#location.column - numberOfColumns};
    } else {
      return {
        index: this.#location.index - numberOfColumns,
        line: this.#location.line - 1,
        column: this.#location.column + this.#lastLineLength - numberOfColumns
      };
    }
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
        this.throwSyntaxError('Unknown literal value: ' + this.#literalBuffer, this.#getLocationMinusColumns(this.#literalBuffer.length));
    }
  }

  #pushToken(type, opt_value, opt_location) {
    let location = opt_location === undefined ? this.#location : opt_location;
    this.tokenTypes[this.numberOfTokens] = type;
    if (opt_value !== undefined) this.tokenValues[this.numberOfTokens] = opt_value;
    ++this.numberOfTokens;
  }

  // Push a token for what is currently stored in the state, and reset the state.
  #flushState() {
    if (this.#literalBuffer !== null) {
      this.#pushToken(TOKEN_TYPE.LITERAL, this.#getLiteralBufferValue());
      this.#literalBuffer = null;
    }
  }

  // Helper function for flushing state and pushing a token.
  #flushStateAndPushToken(type, opt_value) {
    this.#flushState();
    this.#pushToken(type, opt_value);
  }

  // Push a token for what is stored in the string buffer, and reset it.
  #flushString() {
    if (this.#mode === MODE.STRING) {
      this.#pushToken(TOKEN_TYPE.STRING_CHUNK, this.#stringBuffer.join(''));
      this.#stringBuffer = [];
    }
  }

  #updateLocationForNewLine() {
    this.#lastLineLength = this.#location.column;
    ++this.#location.line;
    this.#location.column = 0;
  }

  #updateLocation(char) {
    ++this.#location.index;
    ++this.#location.column;
    switch (char) {
      case '\r':
        this.#updateLocationForNewLine();
        this.#lastCharIsCR = true;
        break;
      case '\n':
        if (!this.#lastCharIsCR) this.#updateLocationForNewLine();
      default:
        this.#lastCharIsCR = false;
    }
  }

  // Process a single character of input.
  #lex(char) {
    this.#updateLocation(char);
    if (this.#mode === MODE.MAIN) {
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
          this.#mode = MODE.STRING;
          this.#pushToken(TOKEN_TYPE.START_STRING);
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
          } else {
            this.#literalBuffer += char;
          }
          break;
      }
    } else if (this.#mode === MODE.STRING) {
      // In a string, outside of an escape sequence.
      switch (char) {
        case '\\':
          this.#flushState();
          this.#mode = MODE.ESCAPE_SEQUENCE;
          break;
        case '"':
          this.#flushString();
          this.#pushToken(TOKEN_TYPE.END_STRING);
          this.#stringBuffer = [];
          this.#mode = MODE.MAIN;
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
      if (char === '"' && this.#escapeSequenceBuffer) {
        this.throwSyntaxError('Incomplete escape sequence: \\' + this.#escapeSequenceBuffer.join(''));
      }
      this.#escapeSequenceBuffer.push(char);
      const value = getCharFromEscapeSequence(this.#escapeSequenceBuffer.join(''));
      if (value == ESCAPE_SEQUENCE_ERROR) {
        this.throwSyntaxError('Illegal escape sequence: \\' + this.#escapeSequenceBuffer);
      } else if (value) {
        this.#stringBuffer.push(value);
        this.#escapeSequenceBuffer = [];
        this.#mode = MODE.STRING;
      }
    }
  }

}
