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

const MODE = {
  MAIN: 1,
  STRING: 2,
  ESCAPE_SEQUENCE: 3,
  UNICODE_ESCAPE_SEQUENCE: 4
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
  // The lexer can output zero, one or two tokens at a time. When there are two tokens,
  // the first one is always a literal value.
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
    if (this.#mode !== MODE.MAIN) this.throwSyntaxError('Unterminated string');
    this.#flushLiteral();
  }

  reset() {
    this.#mode = MODE.MAIN;
    this.#stringBuffer = [];
    this.#literalBuffer = null;
    this.#unicodeBuffer = '';
    this.#location = {index: 0, line: 1, column: 0};
    this.#lastLineLength = 0;
    this.#lastCharIsCR = false;
  }

  // --------------------------------------------------------------------------------
  // The implementation of the lexer.

  // The current mode of lexing.
  #mode;
  // The buffer for accumulating string content while parsing a JSON string.
  #stringBuffer;
  // The buffer for accumulating characters in an unicode escape sequence within a string.
  #unicodeBuffer;
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
    this.tokenTypes[this.numberOfTokens] = type;
    if (opt_value !== undefined) this.tokenValues[this.numberOfTokens] = opt_value;
    ++this.numberOfTokens;
  }

  // Push a token for what is currently stored in the state, and reset the state.
  #flushLiteral() {
    if (this.#literalBuffer !== null) {
      this.#pushToken(TOKEN_TYPE.LITERAL, this.#getLiteralBufferValue());
      this.#literalBuffer = null;
    }
  }

  // Push a token for what is stored in the string buffer, and reset it.
  #flushString(opt_isEnd) {
    if (this.#mode !== MODE.MAIN) {  // #mode === MODE.STRING || #mode === MODE.ESCAPE_SEQUENCE
      this.#pushToken(opt_isEnd ? TOKEN_TYPE.END_STRING : TOKEN_TYPE.STRING_CHUNK, this.#stringBuffer.join(''));
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
        case '{': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.START_OBJECT); break;
        case '}': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.END_OBJECT); break;
        case '[': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.START_ARRAY); break;
        case ']': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.END_ARRAY); break;
        case ',': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.COMA); break;
        case ':': this.#flushLiteral(); this.#pushToken(TOKEN_TYPE.COLON); break;
        // Strings
        case '"':
          this.#flushLiteral();
          this.#stringBuffer = [];
          this.#mode = MODE.STRING;
          this.#pushToken(TOKEN_TYPE.START_STRING);
          break;
        case ' ':
        case '\t':
        case '\r':
        case '\n':
          this.#flushLiteral();
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
          this.#mode = MODE.ESCAPE_SEQUENCE;
          break;
        case '"':
          this.#flushString(true);
          this.#mode = MODE.MAIN;
          break;
        case '\n':
        case '\r':
        default:
          this.#stringBuffer.push(char);
          break;
      }
    } else if (this.#mode === MODE.ESCAPE_SEQUENCE) {
      // The first character of an escape sequence.
      let str = ESCAPE_SEQUENCES[char];
      if (str) {
        this.#stringBuffer.push(str);
        this.#mode = MODE.STRING;
      } else if (char === 'u') {
        this.#mode = MODE.UNICODE_ESCAPE_SEQUENCE;
      } else {
        this.throwSyntaxError('Illegal escape sequence: \\' + char);
      }
    } else {  // this.#mode === MODE.UNICODE_ESCAPE_SEQUENCE
      this.#unicodeBuffer += char;
      if (this.#unicodeBuffer.length === 4) {
        const charCode = parseInt(this.#unicodeBuffer, 16);
        if (Number.isFinite(charCode)) {
          this.#stringBuffer.push(String.fromCharCode(charCode));
          this.#mode = MODE.STRING;
        } else {
          this.throwSyntaxError('Illegal escape sequence: \\u' + this.#unicodeBuffer);
        }
      }
    }
  }

}
