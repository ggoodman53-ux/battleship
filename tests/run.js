'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const testFiles = fs.readdirSync(__dirname)
  .filter(function (file) { return /\.test\.js$/.test(file); })
  .sort();
const tests = [];

function test(name, run) {
  tests.push({ name: name, run: run });
}

function log(message) {
  console.log(message);
}

testFiles.forEach(function (file) {
  try {
    const register = require(path.join(__dirname, file));
    if (typeof register === 'function') {
      register({ test: test, assert: assert, log: log });
    } else {
      throw new TypeError(file + ' must export a test registration function');
    }
  } catch (error) {
    test(file + ' loads', function () { throw error; });
  }
});

let failures = 0;
tests.forEach(function (entry) {
  try {
    entry.run();
    console.log('✓ ' + entry.name);
  } catch (error) {
    failures += 1;
    console.error('✗ ' + entry.name);
    console.error(error && error.stack ? error.stack : error);
  }
});

console.log('\n' + (tests.length - failures) + '/' + tests.length + ' tests passed');
if (failures) process.exitCode = 1;
