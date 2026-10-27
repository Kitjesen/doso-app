const args = process.argv.slice(2);
const mode = args[0];

const fail = () => { process.exitCode = 91; };

if (mode === 'simple') {
  if (args.length === 3 && args[1] === 'alpha' && args[2] === 'com.synthetic.qa;fixture') {
    process.stdout.write('cmd-fixture=PASS mode=simple');
  } else fail();
} else if (mode === 'space') {
  if (args.length === 3 && args[1] === 'space value' && args[2] === 'tail') {
    process.stdout.write('cmd-fixture=PASS mode=space');
  } else fail();
} else if (mode === 'stdin') {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString('utf8');
  if (args.length === 2 && args[1] === 'com.synthetic.qa;stdin' && value === '输入Ω-no-newline') {
    process.stdout.write('cmd-fixture=PASS mode=stdin 完成');
  } else fail();
} else if (mode === 'exit37') {
  process.exitCode = 37;
} else fail();
