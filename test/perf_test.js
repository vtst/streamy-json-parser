// Unit tests on a randomly generated JSON string for performance.
// Disclaimer: this is a flaky test.

import assert from 'assert';
import { Parser } from '../src/parser.js';
import seedrandom from 'seedrandom';

const random = seedrandom('streamy-json-parser'); 

function parse(str, opt_options) {
  let parser = new Parser(opt_options);
  parser.push(str);
  parser.close();
  return parser.getValue();
}

function generateRandomJson(seed, depth) {
  const rng = seedrandom(seed);

  function generateString(length) {
    const characters = 
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(rng.double() * characters.length));
    }
    return result;
  }

  function generateJson(depth) {
    if (depth === 0) {
      let value = rng.double();
      if (value < 0.1) return null;
      if (value < 0.2) return true;
      if (value < 0.3) return false;
      if (value < 0.7) return generateString(25);
      return rng.double() * 1000000;
    } else {
      let size = Math.floor(rng.double() * 3) + 3;
      if (rng.double() < 0.5) {
        let arr = [];
        for (let i = 0; i < size; i++) {
          arr.push(generateJson(depth - 1));
        }
        return arr;
      } else {
        let obj = {};
        for (let i = 0; i < size; i++) {
          obj[generateString(10)] = generateJson(depth - 1);
        }
        return obj;
      }
    }
  }

  return generateJson(depth);
}

function time(iterations, fn, ...args) {
  let start = Date.now();
  for (let i = 1; i < iterations; i++) {
    fn(...args);
  }
  let result = fn(...args);fn(...args);
  let end = Date.now();
  return {result, time: (end - start) / iterations};
}

function splitStringIntoChunks(str, chunkSize) {
  let result = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    result.push(str.slice(i, i + chunkSize));
  }
  return result;
}

function parseInChunks(str, chunkSize, opt_placeholder) {
  let parser = new Parser({include_incomplete_strings: '...'});
  if (opt_placeholder) parser.setPlaceholder(opt_placeholder);
  for (const chunk of chunkSize ? splitStringIntoChunks(str, chunkSize) : [str]) {
    parser.push(chunk);
  }
  parser.close();
  return parser.getValue();
}

{
  console.log('Starting with a small test to check everything is OK');
  let smallObj = generateRandomJson('abc', 2);
  assert.deepStrictEqual(parseInChunks(JSON.stringify(smallObj), 0), smallObj);
  console.log('Generating a large JSON object');
  let obj = generateRandomJson('abc', 10);
  console.log('Stringifying the JSON object');
  let str = JSON.stringify(obj);
  console.log(str.length + ' characters');
  let {result: o0, time: t0} = time(1, JSON.parse, str);
  let {result: o1, time: t1} = time(1, parseInChunks, str, 0);
  console.log(`JSON.parse: ${t0}ms, parse: ${t1}ms, ratio: ${Math.round(10 * t1/t0) / 10}`);
  assert.deepStrictEqual(o0, o1);
}
