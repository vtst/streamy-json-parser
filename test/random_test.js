// Unit tests on a randomly generated JSON string.
// Disclaimer: this is a flaky test.

import assert from 'assert';
import { Parser } from '../src/parser.js';

function parse(str, opt_options) {
  let parser = new Parser(opt_options);
  parser.push(str);
  parser.close();
  return parser.getValue();
}

function generateRandomString(length) {
  const characters = 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function generateRandomJson(depth) {
  if (depth === 0) {
    let value = Math.random();
    if (value < 0.1) return null;
    if (value < 0.2) return true;
    if (value < 0.3) return false;
    if (value < 0.7) return generateRandomString(25);
    return Math.random() * 1000000;
  } else {
    let size = Math.floor(Math.random() * 3) + 3;
    if (Math.random() < 0.5) {
      let arr = [];
      for (let i = 0; i < size; i++) {
        arr.push(generateLargeJson(depth - 1));
      }
      return arr;
    } else {
      let obj = {};
      for (let i = 0; i < size; i++) {
        obj[generateRandomString(10)] = generateLargeJson(depth - 1);
      }
      return obj;
    }
  }
}

{
  let obj = generateRandomJson(10);
  assert.deepStrictEqual(parse(JSON.stringify(obj)), obj);
}
