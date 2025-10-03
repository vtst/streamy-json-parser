// Unit tests for success cases.

import assert from 'assert';
import { Parser } from '../src/parser.js';

function splitStringIntoChunks(str, chunkSize) {
  return str.match(new RegExp("(.|[\n\r]){1," + chunkSize + "}", "g"));
}

function parseInChunks(str, chunkSize, opt_placeholder) {
  let parser = new Parser({include_incomplete_strings: '...'});
  if (opt_placeholder) parser.setPlaceholder(opt_placeholder);
  for (const chunk of splitStringIntoChunks(str, chunkSize)) {
    parser.push(chunk);
  }
  parser.close();
  return parser.getValue();
}

const EXAMPLE_1 = [
  {
    "name": "Barcelona",
    "country": "Spain",
    "countryCode": "ES",
    "reason": "Barcelona offers pleasant weather in March, ideal for exploring its stunning architecture like Sagrada Familia and Park Güell. The city's vibrant street life and delicious tapas provide a fantastic cultural experience."
  },
  {
    "name": "Rome",
    "country": "Italy",
    "countryCode": "IT",
    "reason": "March in Rome provides a delightful balance of fewer crowds and mild temperatures, perfect for visiting ancient ruins like the Colosseum and Roman Forum. You can enjoy authentic Italian cuisine and discover charming hidden alleyways."
  },
  {
    "name": "Kyoto",
    "country": "Japan",
    "countryCode": "JP",
    "reason": "Kyoto in March is enchanting as cherry blossoms begin to bloom, offering breathtaking scenery, especially around temples and gardens. The traditional tea houses and serene bamboo groves create a unique and tranquil experience."
  },
  {
    "name": "Amsterdam",
    "country": "Netherlands",
    "countryCode": "NL",
    "reason": "March in Amsterdam sees the tulip fields starting to burst with color, and the city's canals are less crowded, making for peaceful boat tours. World-class museums like the Rijksmuseum and Van Gogh Museum offer rich cultural immersion."
  }
];

const PLACEHOLDER_1 = [
  {
    "name": null,
    "country": null,
    "countryCode": null,
    "reason": null,
    "foo": "bar"
  },
  {
    "name": null,
    "country": null
  },
  {
    "name": null,
    "country": null,
    "countryCode": null,
    "reason": null
  }
];

{
  assert.deepStrictEqual(parseInChunks(JSON.stringify(EXAMPLE_1), 13, PLACEHOLDER_1), EXAMPLE_1, "EXAMPLE_1");
}

const EXAMPLE_2 = {
  "id": 101,
  "isActive": true,
  "balance": -50.25e3,
  "tags": ["alpha", "beta", null],
  "details": {
    "version": "1.0",
    "timestamp": "2025-10-01T12:00:00Z"
  }
};

{
  assert.deepStrictEqual(parseInChunks(JSON.stringify(EXAMPLE_2, null, 2), 21), EXAMPLE_2, "EXAMPLE_2");
}

const EXAMPLE_3 = {
  "user_name": "Clémentine",
  "comment": "Ceci contient un saut de ligne : \n et une tabulation : \t. Ainsi qu'un caractère unicode : \u0394.",
  "empty_data": [{}, [], ""],
  "large_number": 9007199254740991
};

{
  assert.deepStrictEqual(parseInChunks(JSON.stringify(EXAMPLE_3), 5), EXAMPLE_3, "EXAMPLE_3");
}

const EXAMPLE_4 = {
  "level1": {
    "data1": [
      {
        "level2": {
          "level3_array": [
            { "final_id": 1, "status": "ok" },
            { "final_id": 2, "status": "error" }
          ]
        }
      }
    ],
    "count": 2
  }
};

{
  assert.deepStrictEqual(parseInChunks(JSON.stringify(EXAMPLE_4), 25), EXAMPLE_4, "EXAMPLE_4");
}

const EXAMPLE_5 = {
  "a": [1, 2, 3],
  "b": {"c": 4, "d": {"e": 5, "f": 6}},
  "g": 7
};

const EXPECTED_EVENTS_5 = [
  { "type": "begin", "path": [] },
  { "type": "begin", "path": ["a"] },
  { "type": "set", "path": ["a", 0] },
  { "type": "set", "path": ["a", 1] },
  { "type": "set", "path": ["a", 2] },
  { "type": "end", "path": ["a"] },
  { "type": "begin", "path": ["b"] },
  { "type": "set", "path": ["b", "c"] },
  { "type": "begin", "path": ["b", "d"] },
  { "type": "set", "path": ["b", "d", "e"] },
  { "type": "set", "path": ["b", "d", "f"] },
  { "type": "end", "path": ["b", "d"] },
  { "type": "end", "path": ["b"] },
  { "type": "set", "path": ["g"] },
  { "type": "end", "path": [] }
];


{
  let parser = new Parser({track_events: true});
  parser.push(JSON.stringify(EXAMPLE_5));
  parser.close();
  let events = parser.takeEvents();
  assert.deepStrictEqual(events, EXPECTED_EVENTS_5, "EXAMPLE_5");
}