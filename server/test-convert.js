'use strict';
// Converter tests (public/convert-cs.js). Run from server/test.js, or alone: node server/test-convert.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { convertCs, checkSource, validatePluginJson, makeZip, slugify, PLACEHOLDERS } = require('../public/convert-cs.js');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const fx = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');

// The Catalogue validator, from the sibling checkout (CI sets NODEGSM_CATALOGUE). Skipped, loudly, when it is not there.
function loadCatalogue() {
  const dirs = [process.env.NODEGSM_CATALOGUE, path.join(__dirname, '..', '..', 'Node.NodeGSM.Catalogue')].filter(Boolean);
  for (const d of dirs) { const f = path.join(d, 'scripts', 'lib', 'validate.js'); if (fs.existsSync(f)) return { validate: require(f).validate, dir: d }; }
  return null;
}

function run(ok) {
  const cat = loadCatalogue();
  if (!cat) console.log('  SKIP Catalogue validator checks: no sibling ..\\Node.NodeGSM.Catalogue checkout (set NODEGSM_CATALOGUE to its folder to run them)');
  const hardErrors = (r) => (cat ? cat.validate(r.pluginJson).errors : []);

  // ---- the three WindowsGSM samples
  let r = convertCs(fx('paper-NewPlugin.cs'));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.strictEqual(r.id, 'minecraft-paper-server');
  assert.strictEqual(r.pluginJson.name, 'Minecraft: Paper Server');
  assert.strictEqual(r.pluginJson.author, 'Your name');
  assert.strictEqual(r.pluginJson.version, '1.0.0');
  assert.deepStrictEqual(r.pluginJson.install, { type: 'manual' });
  assert.deepStrictEqual(r.pluginJson.run, { exe: 'paper.jar', command: 'java', args: ['{param}', '-jar', 'paper.jar', 'nogui'], stdin: true, stopCommand: 'stop' });
  assert.deepStrictEqual(r.pluginJson.defaults, { port: '25565', queryPort: '25565', maxPlayers: '20', map: 'world', portIncrement: 1 });
  assert.strictEqual(r.pluginJson.query, 'ut3');
  assert.ok(r.warnings.some((w) => /Java/.test(w)) && r.warnings.some((w) => /EULA/.test(w)) && r.warnings.some((w) => /RCON/.test(w)));
  for (const m of ['Install', 'Update', 'GetRemoteBuild', 'GetLocalBuild', 'CreateServerCFG']) assert.ok(r.todos.some((t) => t.startsWith(m + '()')), 'TODO for ' + m);
  assert.ok(r.todos.some((t) => /papermc\.io/.test(t)), 'the URLs used are listed, not guessed');
  assert.deepStrictEqual(hardErrors(r), []);
  assert.ok(r.readmeText.includes('# Minecraft: Paper Server') && r.readmeText.includes('TODO'));
  assert.ok(r.prBody.includes('- [x] Adds a new plugin: `plugins/minecraft-paper-server`') && r.prBody.includes('- [ ] Tested in NodeGSM') && r.prBody.includes('icon.png'));
  assert.ok(r.pluginJsonText.endsWith('\n') && JSON.parse(r.pluginJsonText).id === r.id);
  ok('converter: WindowsGSM NewPlugin (Paper) sample');

  r = convertCs(fx('Skeleton.cs'));
  assert.strictEqual(r.ok, false); assert.ok(/executable/.test(r.errors[0])); assert.ok(r.pluginJson, 'still returns the draft so the page can ask for the executable');
  r = convertCs(fx('Skeleton.cs'), { exe: '.\\Bin\\srv.exe', name: 'My Game', author: 'me' });
  assert.strictEqual(r.ok, true, r.errors.join(';')); assert.strictEqual(r.pluginJson.run.exe, 'Bin/srv.exe'); assert.strictEqual(r.pluginJson.name, 'My Game'); assert.strictEqual(r.pluginJson.author, 'me');
  assert.deepStrictEqual(hardErrors(r), []);
  r = convertCs(fx('Skeleton-SteamCMDAgent.cs'));
  assert.strictEqual(r.ok, false);
  assert.ok(r.warnings.some((w) => /loginAnonymous is false/.test(w)), 'login warning, not gslt');
  assert.strictEqual(r.pluginJson.gslt, undefined);
  ok('converter: Skeleton samples (empty metadata -> clear error, draft kept, overrides)');

  // ---- original fixtures
  r = convertCs(fx('Example-SteamCMD.cs'));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  const pj = r.pluginJson;
  assert.strictEqual(r.id, 'palgame'); assert.strictEqual(pj.name, 'Palgame Dedicated Server');
  assert.strictEqual(pj.author, 'ExampleAuthor', 'comment with a fake Plugin block is ignored');
  assert.strictEqual(pj.version, '1.2.0', 'comment with a fake version is ignored, 1.2 -> semver');
  assert.strictEqual(pj.description, 'A "quoted" description with {braces} and a // fake comment');
  assert.strictEqual(pj.color, '#1e8449', 'string concatenation in a literal');
  assert.strictEqual(pj.url, 'https://example.com/palgame');
  assert.deepStrictEqual(pj.install, { type: 'steamcmd', appId: '123456' });
  assert.strictEqual(pj.run.exe, 'Pal/Binaries/Win64/PalServer.exe', 'verbatim @".\\x\\y" normalised');
  assert.deepStrictEqual(pj.run.args, ['-port={port}', '-queryport={queryPort}', '-players={maxPlayers}', '-publicip={ip}', '-servername={name}', '{param}']);
  assert.strictEqual(pj.run.stdin, true); assert.strictEqual(pj.run.stopCommand, 'quit'); assert.strictEqual(pj.query, 'a2s');
  assert.deepStrictEqual(pj.defaults, { port: '8211', queryPort: '8212', maxPlayers: '32', map: 'MainWorld', additional: '-log', portIncrement: 2 });
  assert.strictEqual(pj.gslt, undefined);
  assert.deepStrictEqual(hardErrors(r), []);
  assert.deepStrictEqual(Object.keys(pj).slice(0, 4), ['$schema', 'id', 'name', 'description']);
  ok('converter: SteamCMD plugin (interpolation, optional parts, comments, verbatim paths)');

  // CRLF + BOM give the same result
  const crlf = '\uFEFF' + fx('Example-SteamCMD.cs').replace(/\r?\n/g, '\r\n');
  assert.deepStrictEqual(convertCs(crlf).pluginJson, pj);
  ok('converter: CRLF and BOM');

  r = convertCs(fx('Example-Concat.cs'));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.strictEqual(r.pluginJson.run.exe, 'bin/server.exe'); assert.strictEqual(r.pluginJson.run.stdin, false);
  assert.deepStrictEqual(r.pluginJson.run.args, ['-console', ['-ip', '{ip}'], ['-port', '{port}'], ['+maxplayers', '{maxPlayers}'], '{param}']);
  assert.strictEqual(r.pluginJson.run.stopCommand, undefined); assert.ok(r.warnings.some((w) => /Stop\(\)/.test(w)));
  assert.strictEqual(r.pluginJson.query, undefined);
  assert.strictEqual(r.pluginJson.name, 'Concat Server', 'expression-bodied FullName');
  assert.deepStrictEqual(hardErrors(r), []);
  ok('converter: StringBuilder / concatenation, property getter, expression-bodied members');

  r = convertCs(fx('Example-Edge.cs'));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.strictEqual(r.id, 'edge', 'the class with the Plugin metadata is picked, not the helper class');
  assert.strictEqual(r.pluginJson.name, 'Edge Server', 'const resolved through an expression-bodied property');
  assert.strictEqual(r.pluginJson.run.exe, 'edge/server.exe');
  assert.strictEqual(r.pluginJson.author.charCodeAt(2), 92, 'escaped backslash');
  assert.strictEqual(r.pluginJson.description, 'Verbatim "quoted" text');
  assert.strictEqual(r.pluginJson.url, 'http://example.org/{not-a-placeholder}', 'braces in a plain string');
  assert.strictEqual(r.pluginJson.defaults.port, '1234'); assert.strictEqual(r.pluginJson.defaults.additional, '-a "b c" // not a comment');
  assert.strictEqual(r.pluginJson.query, 'fivem'); assert.strictEqual(r.pluginJson.run.stdin, true, '{ get; } = true');
  assert.ok(r.todos.some((t) => /Path\.Combine/.test(t)), 'C# code in the command line is a TODO, not guessed');
  assert.ok(r.warnings.some((w) => /INCOMPLETE/.test(w)) && r.warnings.some((w) => /inside if/.test(w)));
  assert.ok(!JSON.stringify(r.pluginJson.run.args).includes('Path'), 'no guessed text in args');
  assert.deepStrictEqual(hardErrors(r), []);
  ok('converter: several classes, consts, braces in strings, unconvertible command line pieces');

  // ---- small inline cases
  const wrap = (body, meta) => `namespace WindowsGSM.Plugins { public class Tiny { public Plugin Plugin = new Plugin { ${meta || 'name = "Tiny", author = "a", description = "d", version = "1.0"'} }; ${body} } }`;
  r = convertCs(wrap('public string StartPath = "t.exe";'));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.pluginJson.run.stdin, undefined, 'nothing detected -> nothing emitted'); assert.strictEqual(r.pluginJson.defaults, undefined);
  r = convertCs('namespace WindowsGSM.Plugins { public class P2 { public Plugin Plugin; public P2() { Plugin = new Plugin(); Plugin.name = "Assigned"; plugin.author = "Zed"; } public string StartPath = "a.exe"; } }');
  assert.strictEqual(r.ok, true, r.errors.join(';')); assert.strictEqual(r.pluginJson.author, 'Zed', 'property-style assignments');
  assert.strictEqual(r.pluginJson.name, 'Assigned', 'no FullName -> Plugin.name'); assert.strictEqual(r.id, 'p2', 'id from the class name');
  r = convertCs(wrap('public string StartPath = "t.exe"; public override string AppId => "4242"; public override bool loginAnonymous => false; public async Task<Process> Start() { string p = $"+sv_setsteamaccount {_serverData.ServerGSLT} -port {_serverData.ServerPort}"; var x = new Process { StartInfo = { Arguments = p } }; return x; }'));
  assert.deepStrictEqual(r.pluginJson.install, { type: 'steamcmd', appId: '4242' }, 'numeric AppId without the base class'); assert.strictEqual(r.pluginJson.gslt, true, 'GSLT used in Start()');
  assert.deepStrictEqual(r.pluginJson.run.args, [['+sv_setsteamaccount', '{gslt}'], ['-port', '{port}']]);
  assert.ok(!r.warnings.some((w) => /loginAnonymous is false/.test(w)));
  r = convertCs(wrap('public string StartPath = "t.exe"; public async Task<Process> Start() { var p = new Process { StartInfo = { Arguments = !string.IsNullOrWhiteSpace(_serverData.ServerMap) ? "+map " + _serverData.ServerMap : string.Empty } }; return p; }'));
  assert.deepStrictEqual(r.pluginJson.run.args, [['+map', '{map}']], 'reversed IsNullOrWhiteSpace ternary becomes an optional group');
  r = convertCs(wrap('public string StartPath = "t.exe"; public object QueryMethod = new Gamespy();'));
  assert.strictEqual(r.pluginJson.query, undefined); assert.ok(r.warnings.some((w) => /Gamespy/.test(w)));
  r = convertCs(wrap('public string StartPath = Path.Combine("a", "b");'));
  assert.strictEqual(r.ok, false); assert.ok(r.warnings.some((w) => /StartPath is not a plain text value/.test(w)));
  r = convertCs(wrap('public string StartPath = "../evil.exe";'));
  assert.strictEqual(r.ok, false, '".." in the executable is a hard error');
  r = convertCs(wrap('public string StartPath = "t.exe";', 'name = "T", color = "#fff"'));
  assert.strictEqual(r.pluginJson.color, '#ffffff');
  ok('converter: placeholders, GSLT / login, ternaries, unsupported query, bad executables');

  // ---- ids
  assert.strictEqual(convertCs(fx('Example-SteamCMD.cs'), { existingIds: new Set(['palgame', 'palgame-2']) }).id, 'palgame-3', 'collision-safe suggestion');
  r = convertCs(fx('Example-SteamCMD.cs'), { id: 'Bad Id!' }); assert.strictEqual(r.ok, false); assert.ok(/"id"/.test(r.errors.join()));
  r = convertCs(fx('Example-SteamCMD.cs'), { id: 'palgame', existingIds: ['palgame'] }); assert.strictEqual(r.ok, false); assert.ok(/already exists/.test(r.errors.join()));
  r = convertCs(fx('Example-SteamCMD.cs'), { id: 'my-pal' }); assert.strictEqual(r.id, 'my-pal'); assert.strictEqual(r.detected.suggestedId, 'palgame');
  assert.strictEqual(slugify('  Mínecraft: Paper/Server! '), 'minecraft-paper-server');
  ok('converter: id suggestion, collisions, user-edited ids');

  // ---- not a plugin / bad input
  r = convertCs('using System; namespace X { public class Foo { public int A = 1; } }');
  assert.strictEqual(r.ok, false); assert.ok(/plugin metadata/i.test(r.errors[0]));
  r = convertCs('this is not C# at all'); assert.strictEqual(r.ok, false); assert.ok(/No C# class/.test(r.errors[0]));
  assert.strictEqual(convertCs('').ok, false);
  assert.ok(checkSource('abc\u0000def')); assert.ok(checkSource('x'.repeat(200 * 1024 + 1))); assert.ok(checkSource('caf\uFFFD')); assert.strictEqual(checkSource('class A {}\r\n\ttab'), '');
  assert.strictEqual(convertCs('x'.repeat(300000)).ok, false);
  assert.strictEqual(convertCs('class A { public Plugin Plugin = new Plugin { name = "unterminated').ok, false, 'unterminated input does not hang or throw');
  const nasty = '{'.repeat(5000) + '"'.repeat(3) + '('.repeat(5000); assert.strictEqual(convertCs('class A ' + nasty).ok, false);
  ok('converter: not a plugin, binary / huge / broken input');

  // ---- the converter never executes anything: code-looking text stays text
  r = convertCs(wrap('public string StartPath = "t.exe"; static string X = System.IO.File.ReadAllText("C:\\\\secret.txt");', 'name = "T", author = "a\\u0000b", description = "<script>alert(1)</script>"'));
  assert.ok(r.pluginJson.description.includes('<script>'), 'kept as text (renderers escape it)'); assert.ok(!r.pluginJson.author.includes('\u0000'), 'control characters removed');
  ok('converter: text only, control characters removed');

  // ---- strict plugin.json validation (what the submissions route accepts)
  const good = convertCs(fx('Example-SteamCMD.cs')).pluginJson;
  assert.deepStrictEqual(validatePluginJson(good), []);
  const bad = (mut, re) => { const c = JSON.parse(JSON.stringify(good)); mut(c); const e = validatePluginJson(c); assert.ok(e.some((x) => re.test(x)), re + ' in ' + JSON.stringify(e)); };
  bad((c) => { c.install = { steps: [{ type: 'script' }] }; }, /install/);
  bad((c) => { c.install = { type: 'steamcmd', appId: '1', steps: [] }; }, /install\.steps/);
  bad((c) => { c.scripts = {}; }, /not accepted/);
  bad((c) => { c.run.exe = '../x.exe'; }, /run\.exe/);
  bad((c) => { c.run.exe = 'C:/x.exe'; }, /run\.exe/);
  bad((c) => { c.run.command = '../../bin/sh'; }, /run\.command/);
  bad((c) => { c.run.env = { A: 'b' }; }, /run\.env/);
  bad((c) => { c.id = 'A'; }, /"id"/);
  bad((c) => { c.name = 'x\u0007y'; }, /control/);
  bad((c) => { c.media = { icon: '../icon.png' }; }, /media\.icon/);
  bad((c) => { c.docs = [{ title: 't', url: 'javascript:alert(1)', type: 'official' }]; }, /docs\[0\]\.url/);
  bad((c) => { c.query = 'rcon'; }, /query/);
  bad((c) => { c.run.args = [{ a: 1 }]; }, /run\.args/);
  assert.ok(validatePluginJson([]).length && validatePluginJson(null).length);
  ok('validatePluginJson: strict allow-list (no scripts, steps, env, plugin.js)');

  // ---- placeholders are the documented ones
  const plugins = cat && path.join(cat.dir, 'PLUGINS.md');
  if (plugins && fs.existsSync(plugins)) {
    const doc = fs.readFileSync(plugins, 'utf8'); const line = doc.split('\n').find((l) => l.startsWith('Placeholders:'));
    const documented = new Set((line.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)));
    for (const v of Object.values(PLACEHOLDERS)) assert.ok(documented.has(v), `{${v}} is documented in PLUGINS.md`);
    ok('converter: every placeholder it emits is in PLUGINS.md');
  }

  // ---- zip writer
  const z = makeZip({ 'a/plugin.json': '{"id":"a"}\n', 'a/README.md': '# é\n' });
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  assert.strictEqual(dv.getUint32(0, true), 0x04034b50);
  const eocd = z.length - 22; assert.strictEqual(dv.getUint32(eocd, true), 0x06054b50); assert.strictEqual(dv.getUint16(eocd + 10, true), 2);
  const text = Buffer.from(z).toString('utf8'); assert.ok(text.includes('a/plugin.json') && text.includes('{"id":"a"}'));
  const zlib = require('zlib'); if (zlib.crc32) assert.strictEqual(dv.getUint32(14, true), zlib.crc32(Buffer.from('{"id":"a"}\n')), 'crc32');
  ok('zip writer (stored)');
}

module.exports = { run, loadCatalogue };
if (require.main === module) { let n = 0; run((name) => { n++; console.log('  ok ' + name); }); console.log(`\n${n} converter checks passed`); }
