// Unit tests for failure cases.

import assert from 'assert';
import { SyntaxError } from '../src/error.js';
import { Parser } from '../src/parser.js';

function parse(str, opt_options) {
  let parser = new Parser(opt_options);
  parser.push(str);
  parser.close();
  return parser.getValue();
}

function checkSyntaxError(message) {
  return (err) =>
    err instanceof SyntaxError &&
    err.message === message;
}

const FAILING_EXAMPLE_1 = `{
  "clé": "valeur",
  "autre_clé": 123,
}`;

{
  assert.throws(
    () => parse(FAILING_EXAMPLE_1),
    checkSyntaxError('Line 4, Column 1: Unexpected token: "}"')
  );
}

const FAILING_EXAMPLE_2 = `{
  key_without_quotes: "valeur",
  "status": 1
}`;

{
  assert.throws(
    () => parse(FAILING_EXAMPLE_2),
    checkSyntaxError('Line 2, Column 3: Unknown literal value: key_without_quotes')
  );
}

const FAILING_EXAMPLE_3 = `{
  "key": "valeur",
  "status": 'SINGLE_QUOTES'
}`;

{
  assert.throws(
    () => parse(FAILING_EXAMPLE_3),
    checkSyntaxError("Line 3, Column 13: Unknown literal value: 'SINGLE_QUOTES'")
  );
}

const FAILING_EXAMPLE_4 = `[
  "missing_colon" "value",
]`;

{
  assert.throws(
    () => parse(FAILING_EXAMPLE_4),
    checkSyntaxError('Line 2, Column 19: Unexpected token: """')
  );
}

const FAILING_EXAMPLE_5 = `{
  "invalid_boolean": tru
}`;

{
  assert.throws(
    () => parse(FAILING_EXAMPLE_5),
    checkSyntaxError('Line 2, Column 22: Unknown literal value: tru')
  );
}
