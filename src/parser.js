// A parser for JSON.

import { SyntaxError } from './error.js';
import { getTokenTypeName, Lexer, TOKEN_TYPE } from './lexer.js';

function CHECK(condition) {
  if (!condition) throw new Error('Assertion failed');
}

const CONTEXT_TYPE = {
  OBJECT: 1,
  ARRAY: 2,
  STRING : 3
};

const CONTEXT_TYPE_NAME = {
  [CONTEXT_TYPE.OBJECT]: 'object',
  [CONTEXT_TYPE.ARRAY]: 'array',
  [CONTEXT_TYPE.STRING]: 'string'
};

const PIECE = {
  PROPERTY_NAME: 1,
  COLON: 2,
  VALUE: 3,
  COMA: 4
};

export class Parser {

  #lexer = new Lexer();
  #events;
  #options;
  #hasPlaceholder = false;

  // Options:
  // * include_incomplete_strings (bool|string): if not false, partially parsed strings are set
  //   after parsing each chunk. This option can be set to a string (e.g. "..."), in which case
  //   this string is appended at the end of partially parsed strings.
  // * track_events: if true, events are tracked when values are set. They are returned by takeEvents().
  constructor(opt_options) {
    this.#options = opt_options || {};
    this.reset();
  }

  // --------------------------------------------------------------------------------
  // The interface for the parser.

  // Append some text to lex to the input string.
  push(text) {
    this.#lexer.push(text);
    this.#parse();
  }

  // End the parsing.
  close() {
    this.#lexer.close();
    this.#parse();
    this.#throwSyntaxErrorIfStackIsNotEmpty();
  }

  reset() {
    this.#lexer.reset();
    this.#index = 0;
    this.#events = [];
    this.#stack = [{type: CONTEXT_TYPE.ARRAY, value: [], key: 0, expectedPiece: PIECE.VALUE, isEmpty: false}];
  }

  setPlaceholder(placeholder) {
    if (this.#index !== 0) throw 'Cannot set placeholder after parsing has started.';
    this.#stack[0].value[0] = placeholder;
    this.#hasPlaceholder = true;
  }

  getValue() { return this.#stack[0].value[0]; }
  takeEvents() {
    if (!this.#options.track_events) throw 'Events are not tracked.';
    const events = this.#events;
    this.#events = [];
    return events;
  }

  // --------------------------------------------------------------------------------
  // The implementation for the parser.

  // The index of the next token of the lexer to read.
  #index;

  // A stack of contexts designating the current node of the root value being set.
  // Possible stack values:
  // * {type: CONTEXT_TYPE.ARRAY, value: [...], key: <number> }
  //   key is the index of the value array to be set. if key == value.length, a value is expected,
  //   if key < value.length, a coma is expected.
  // * {type: CONTEXT_TYPE.OBJECT, value: {...}, key: <string>, expectedPiece: <PIECE>}
  // * {type: STRING, value: "..."} 
  #stack;

  #getToken() { return this.#lexer.tokens[this.#index]; }
  #throwSyntaxError(message) { throw new SyntaxError(this.#getToken()?.location || this.#lexer.location, message); }
  #throwUnexpectedTokenError() { this.#throwSyntaxError(`Unexpected token: "${getTokenTypeName(this.#getToken())}"`); }

  #expectObjectPropertyName(context) {
    return context.type === CONTEXT_TYPE.OBJECT && context.expectedPiece === PIECE.PROPERTY_NAME;
  }

  #canSetValue(context) {
    return context.type !== CONTEXT_TYPE.STRING && context.expectedPiece === PIECE.VALUE;
  }

  #setIncompleteValue(context, value) {
    if (!this.#canSetValue(context)) this.#throwSyntaxError(`Unexpected value`);
    context.value[context.key] = value;
    context.isEmpty = false;
  }

  #pushEvent(type) {
    if (this.#options.track_events) {
      this.#events.push({type, path: this.#getPath()});
    }
  }

  #setValue(value) {
    let context = this.#stack.at(-1);
    this.#setIncompleteValue(context, value);
    context.expectedPiece = PIECE.COMA;
    this.#pushEvent(typeof value === 'object' ? 'begin' : 'set');
  }

  #getPath() {
    return this.#stack.slice(1).map(context => context.key);
  }

  #getValue(context) {
    CHECK(context.type !== CONTEXT_TYPE.STRING);
    return context.value[context.key];
  }

  #nextArrayItemOrObjectProperty(context) {
    switch (context.type) {
      case CONTEXT_TYPE.ARRAY:
        ++context.key;
        context.expectedPiece = PIECE.VALUE;
        break;
      case CONTEXT_TYPE.OBJECT:
        context.propertyNames.add(context.key);
        context.expectedPiece = PIECE.PROPERTY_NAME;
        break;
    }
  }

  #closeArrayOrObject(context) {
    if (!context.isEmpty) this.#nextArrayItemOrObjectProperty(context);
    if (this.#hasPlaceholder) {
      // Remove items/properties that were in the placeholder but not in the parsed value.
      switch (context.type) {
        case CONTEXT_TYPE.ARRAY:
          context.value.length = context.key;
          break;
        case CONTEXT_TYPE.OBJECT:
          for (const propertyName in context.value) {
            if (!context.propertyNames.has(propertyName)) delete context.value[propertyName];
          }
          break;
      }
    }
    this.#stack.pop();
    this.#pushEvent('end');
  }

  #parse() {
    for (; this.#index < this.#lexer.tokens.length; ++this.#index) {
      const token = this.#lexer.tokens[this.#index];
      const context = this.#stack.at(-1);
      switch (typeof token === 'object' ? token.type : token) {
        case TOKEN_TYPE.LITERAL:
          this.#setValue(token.value);
          break;
        case TOKEN_TYPE.START_OBJECT:
          let newObject = this.#getValue(context) || {};
          this.#setValue(newObject);
          this.#stack.push(
            {type: CONTEXT_TYPE.OBJECT, value: newObject, expectedPiece: PIECE.PROPERTY_NAME, propertyNames: new Set(), isEmpty: true});
          break;
        case TOKEN_TYPE.END_OBJECT:
          if (context.type !== CONTEXT_TYPE.OBJECT || context.expectedPiece !== (context.isEmpty ? PIECE.PROPERTY_NAME : PIECE.COMA)) {
            this.#throwUnexpectedTokenError();
          }
          this.#closeArrayOrObject(context);
          break;
        case TOKEN_TYPE.START_ARRAY:
          let newArray = this.#getValue(context) || [];
          this.#setValue(newArray);
          this.#stack.push({type: CONTEXT_TYPE.ARRAY, value: newArray, key: 0, expectedPiece: PIECE.VALUE, isEmpty: true});
          break;
        case TOKEN_TYPE.END_ARRAY:
          if (context.type !== CONTEXT_TYPE.ARRAY || (!context.isEmpty && context.expectedPiece === PIECE.VALUE)) {
            this.#throwUnexpectedTokenError();
          }
          this.#closeArrayOrObject(context);
          break;
        case TOKEN_TYPE.COLON:
          switch (context.type) {
            case CONTEXT_TYPE.ARRAY: this.#throwUnexpectedTokenError();
            case CONTEXT_TYPE.OBJECT:
              if (context.type !== CONTEXT_TYPE.OBJECT || context.expectedPiece !== PIECE.COLON) {
                this.#throwUnexpectedTokenError();
              }
              context.expectedPiece = PIECE.VALUE;
              break;
            case CONTEXT_TYPE.STRING: CHECK(false);
          }
          break;
        case TOKEN_TYPE.COMA:
          CHECK(context.type !== CONTEXT_TYPE.STRING);
          if (context.expectedPiece !== PIECE.COMA) this.#throwUnexpectedTokenError();
          this.#nextArrayItemOrObjectProperty(context);
          break;
        case TOKEN_TYPE.START_STRING:
          if (!(this.#canSetValue(context) || this.#expectObjectPropertyName(context))) {
            this.#throwUnexpectedTokenError();
          }
          this.#stack.push({type: CONTEXT_TYPE.STRING, value: ''});
          break;
        case TOKEN_TYPE.STRING_CHUNK:
          CHECK(context.type === CONTEXT_TYPE.STRING);
          context.value += token.value;
          break;
        case TOKEN_TYPE.END_STRING:
          CHECK(context.type === CONTEXT_TYPE.STRING);
          this.#stack.pop();
          const newContext = this.#stack.at(-1);
          if (this.#expectObjectPropertyName(newContext)) {
            newContext.expectedPiece = PIECE.COLON;
            newContext.key = context.value;
          } else {
            this.#setValue(context.value);
          }
          break;      
      }
    }
    // Include incomplete string.
    if (this.#options.include_incomplete_strings && this.#stack.length > 1) {
      const context1 = this.#stack.at(-1), context2 = this.#stack.at(-2);
      if (context1.type == CONTEXT_TYPE.STRING && !this.#expectObjectPropertyName(context2)) {
        this.#setIncompleteValue(
          context2,
          context1.value + (typeof this.#options.include_incomplete_strings === 'string' ? this.#options.include_incomplete_strings : ''));
      }
    }
  }

  #throwSyntaxErrorIfStackIsNotEmpty() {
    if (this.#stack.length == 1) return;
    let context = this.#stack.at(-1);
    this.#throwSyntaxError(`Unterminated ${CONTEXT_TYPE_NAME[context.type]}`);
  }
}

export function* parse(stream, opt_options) {
  let parser = new Parser(opt_options);
  const trackEvents = opt_options?.track_events;
  for (const chunk of stream) {
    parser.push(chunk);
    yield {root: parser.getValue(), events: trackEvents && parser.takeEvents(), done: false};
  }
  parser.close();
  yield {root: parser.getValue(), events: trackEvents && parser.takeEvents(), done: true};
}
