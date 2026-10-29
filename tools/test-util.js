// Checks the delimiter parser in src/core/util.js without a browser.
// util.js attaches itself to window.K, so a stub window is enough to load it.
global.window = { addEventListener: () => {} };
new Function('window', require('fs').readFileSync(__dirname + '/../src/core/util.js', 'utf8'))(global.window);
const U = global.window.K.util;

let fails = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log(`FAIL ${label}: got ${g}, want ${w}`); }
};

const BOM = String.fromCharCode(0xfeff);

// auto-detect
eq('comma, trailing newline', U.parseDelimited('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
eq('tab detected', U.parseDelimited('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
eq('pipe detected', U.parseDelimited('a|b|c\n1|2|3'), [['a', 'b', 'c'], ['1', '2', '3']]);
eq('semicolon detected', U.parseDelimited('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
eq('single column stays one cell', U.parseDelimited('just one column'), [['just one column']]);
eq('detect reports pipe', U.detectDelimiter('a|b|c'), '|');
eq('detect reports none', U.detectDelimiter('nothing here'), null);

// explicit choice overrides detection
eq('forced semicolon', U.parseDelimited('a;b\n1;2', 'semicolon'), [['a', 'b'], ['1', '2']]);
eq('none keeps whole lines', U.parseDelimited('a,b\n1,2', 'none'), [['a,b'], ['1,2']]);

// quoting, per RFC 4180
eq('quoted delimiter', U.parseDelimited('"x,y",b\n1,2'), [['x,y', 'b'], ['1', '2']]);
eq('escaped quotes', U.parseDelimited('"he said ""hi""",b\n1,2'), [['he said "hi"', 'b'], ['1', '2']]);
eq('newline inside quotes', U.parseDelimited('"l1\nl2",b\n1,2'), [['l1\nl2', 'b'], ['1', '2']]);
eq('quoted field with newlines only', U.parseDelimited('"a\nb"'), [['a\nb']]);

// line endings, BOM, degenerate input
eq('crlf', U.parseDelimited('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
eq('bare cr', U.parseDelimited('a,b\r1,2'), [['a', 'b'], ['1', '2']]);
eq('BOM stripped', U.parseDelimited(BOM + 'a,b'), [['a', 'b']]);
eq('empty input', U.parseDelimited(''), [['']]);
eq('null input', U.parseDelimited(null), [['']]);

// JSON and XML are not delimited: they must survive as text lines for a Script DAT
eq('json one line', U.parseDelimited('{"a":1}'), [['{"a":1}']]);
eq('xml stays per line', U.parseDelimited('<root>\n  <a>1</a>\n</root>').length, 3);

// ragged rows are kept, not padded or dropped
eq('ragged rows', U.parseDelimited('a,b,c\n1,2'), [['a', 'b', 'c'], ['1', '2']]);
eq('empty trailing cell', U.parseDelimited('a,b\n1,'), [['a', 'b'], ['1', '']]);

console.log(fails ? `\n${fails} ASSERTION(S) FAILED` : '\nAll delimiter assertions pass (auto-detect, RFC quoting, CRLF/BOM, non-delimited text).');
process.exit(fails ? 1 : 0);
