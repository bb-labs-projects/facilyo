const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'messages');
const ref = JSON.parse(fs.readFileSync(path.join(dir, 'de-CH.json'), 'utf8'));

function getKeys(obj, prefix) {
  prefix = prefix || '';
  return Object.keys(obj).flatMap(k =>
    typeof obj[k] === 'object' ? getKeys(obj[k], prefix + k + '.') : [prefix + k]
  );
}

const refKeys = getKeys(ref).sort();
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'de-CH.json');

let allOk = true;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const keys = getKeys(data).sort();
  const missing = refKeys.filter(k => keys.indexOf(k) < 0);
  const extra = keys.filter(k => refKeys.indexOf(k) < 0);
  if (missing.length || extra.length) {
    console.log(file + ': MISMATCH - missing: ' + missing.length + ', extra: ' + extra.length);
    if (missing.length) console.log('  Missing: ' + missing.join(', '));
    if (extra.length) console.log('  Extra: ' + extra.join(', '));
    allOk = false;
  } else {
    console.log(file + ': OK (' + keys.length + ' keys)');
  }
}

if (allOk) console.log('\nAll files match!');
