process.env.GSD_TEST_MODE = '1';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('node:fs');
const { createTempDir, cleanup } = require('./helpers.cjs');

const {
  getDirName,
  getGlobalDir,
  getConfigDirFromHome,
  convertClaudeToKiroFrontmatter,
  convertClaudeToKiroMarkdown,
  convertClaudeCommandToKiroSkill,
  copyCommandsAsKiroSkills,
  install,
  uninstall,
  writeManifest,
} = require('../bin/install.js');

describe('Kiro runtime directory mapping', () => {
  test('keeps Kilo mapping intact (Kiro does not replace Kilo)', () => {
    assert.strictEqual(getDirName('kilo'), '.kilo');
  });

  test('maps Kiro to .kiro for local installs', () => {
    assert.strictEqual(getDirName('kiro'), '.kiro');
  });

  test('maps Kiro to ~/.kiro for global installs', () => {
    assert.strictEqual(getGlobalDir('kiro'), path.join(os.homedir(), '.kiro'));
  });

  test('returns .kiro config fragments for local and global installs', () => {
    assert.strictEqual(getConfigDirFromHome('kiro', false), "'.kiro'");
    assert.strictEqual(getConfigDirFromHome('kiro', true), "'.kiro'");
  });
});

describe('getGlobalDir (Kiro)', () => {
  let originalKiroConfigDir;

  beforeEach(() => {
    originalKiroConfigDir = process.env.KIRO_CONFIG_DIR;
    delete process.env.KIRO_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalKiroConfigDir !== undefined) {
      process.env.KIRO_CONFIG_DIR = originalKiroConfigDir;
    } else {
      delete process.env.KIRO_CONFIG_DIR;
    }
  });

  test('returns ~/.kiro by default', () => {
    assert.strictEqual(getGlobalDir('kiro'), path.join(os.homedir(), '.kiro'));
  });

  test('returns explicit dir when provided', () => {
    assert.strictEqual(getGlobalDir('kiro', '/custom/kiro-path'), '/custom/kiro-path');
  });

  test('respects KIRO_CONFIG_DIR env var', () => {
    process.env.KIRO_CONFIG_DIR = '~/custom-kiro';
    assert.strictEqual(getGlobalDir('kiro'), path.join(os.homedir(), 'custom-kiro'));
  });
});

describe('Kiro conversion', () => {
  test('rewrites Kilo paths to Kiro paths', () => {
    const input = 'Use ~/.claude and ./.claude/skills/ for tools.';
    const converted = convertClaudeToKiroFrontmatter(input);

    assert.ok(converted.includes('~/.kiro'));
    assert.ok(converted.includes('./.kiro/skills/'));
    assert.ok(!converted.includes('.kilo/skills/'));
  });

  test('converts Claude markdown references for Kiro skills', () => {
    const input = [
      'Claude Code reads ./.claude/skills/ before using ~/.claude/get-shit-done/.',
      'Run /gsd:plan-phase and ask with AskUserQuestion.',
    ].join('\n');

    const converted = convertClaudeToKiroMarkdown(input);

    assert.ok(converted.includes('Kiro reads ./.kiro/skills/'), converted);
    assert.ok(converted.includes('~/.kiro/get-shit-done/'), converted);
    assert.ok(converted.includes('/gsd-plan-phase'), converted);
    assert.ok(!converted.includes('AskUserQuestion'), converted);
  });

  test('converts commands to Kiro skills with Agent Skills frontmatter', () => {
    const command = `---
name: gsd:new-project
description: Initialize a project
allowed-tools:
  - Read
  - Write
---

Use ./.claude/skills/ and run /gsd:help.
`;

    const converted = convertClaudeCommandToKiroSkill(command, 'gsd-new-project');

    assert.ok(converted.includes('name: gsd-new-project'), converted);
    assert.ok(converted.includes('description: "Initialize a project"'), converted);
    assert.ok(!converted.includes('allowed-tools'), converted);
    assert.ok(converted.includes('./.kiro/skills/'), converted);
    assert.ok(converted.includes('/gsd-help'), converted);
  });
});

describe('copyCommandsAsKiroSkills', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-kiro-copy-');
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates one skill directory per GSD command', () => {
    const srcDir = path.join(__dirname, '..', 'commands', 'gsd');
    const skillsDir = path.join(tmpDir, '.kiro', 'skills');

    copyCommandsAsKiroSkills(srcDir, skillsDir, 'gsd', '$HOME/.kiro/', 'kiro');

    const generated = path.join(skillsDir, 'gsd-new-project', 'SKILL.md');
    assert.ok(fs.existsSync(generated), generated);

    const content = fs.readFileSync(generated, 'utf8');
    assert.ok(content.includes('name: gsd-new-project'), content);
    assert.ok(content.includes('description:'), content);
  });
});

describe('Kiro local install/uninstall', () => {
  let tmpDir;
  let previousCwd;

  beforeEach(() => {
    tmpDir = createTempDir('gsd-kiro-install-');
    previousCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    cleanup(tmpDir);
  });

  test('installs GSD into ./.kiro skills and removes it cleanly', () => {
    const result = install(false, 'kiro');
    const targetDir = path.join(tmpDir, '.kiro');

    assert.deepStrictEqual(result, {
      settingsPath: null,
      settings: null,
      statuslineCommand: null,
      runtime: 'kiro',
      configDir: fs.realpathSync(targetDir),
    });

    assert.ok(fs.existsSync(path.join(targetDir, 'skills', 'gsd-new-project', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'get-shit-done', 'VERSION')));
    assert.ok(fs.existsSync(path.join(targetDir, 'agents')));

    const manifest = writeManifest(targetDir, 'kiro');
    assert.ok(Object.keys(manifest.files).some(file => file.startsWith('skills/gsd-new-project/')), manifest);
    assert.ok(!Object.keys(manifest.files).some(file => file.startsWith('command/gsd-')), manifest);

    uninstall(false, 'kiro');

    assert.ok(!fs.existsSync(path.join(targetDir, 'skills', 'gsd-new-project')), 'Kiro skill directory removed');
    assert.ok(!fs.existsSync(path.join(targetDir, 'get-shit-done')), 'get-shit-done removed');
  });
});

describe('Source code integration (Kiro)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');
  const updateWorkflowSrc = fs.readFileSync(path.join(__dirname, '..', 'get-shit-done', 'workflows', 'update.md'), 'utf8');
  const reapplyPatchesSrc = fs.readFileSync(path.join(__dirname, '..', 'commands', 'gsd', 'reapply-patches.md'), 'utf8');

  test('--kiro flag parsing exists', () => {
    assert.ok(src.includes("args.includes('--kiro')"), '--kiro flag parsed');
  });

  test('help text includes --kiro', () => {
    assert.ok(src.includes('Install for Kiro only'), 'help text includes Kiro option');
  });

  test('interactive runtime map includes kiro', () => {
    assert.ok(src.includes("'8': 'kilo'"), 'runtimeMap keeps 8 -> kilo');
    assert.ok(src.includes("'9': 'kiro'"), 'runtimeMap has 9 -> kiro');
    assert.ok(src.includes("'kilo', 'kiro'"), '--all includes kilo and kiro');
    assert.ok(src.includes('9${reset}) Kiro'), 'prompt lists Kiro option');
  });

  test('update workflow checks Kiro runtime and paths', () => {
    assert.ok(updateWorkflowSrc.includes('PREFERRED_RUNTIME="kiro"'), 'workflow can infer Kiro runtime');
    assert.ok(updateWorkflowSrc.includes('PREFERRED_RUNTIME="kilo"'), 'workflow keeps Kilo runtime inference');
    assert.ok(updateWorkflowSrc.includes('.kiro'), 'workflow checks .kiro directories');
    assert.ok(updateWorkflowSrc.includes('.kilo'), 'workflow keeps .kilo directories');
    assert.ok(updateWorkflowSrc.includes('$KIRO_CONFIG_DIR'), 'workflow checks KIRO_CONFIG_DIR');
    assert.ok(updateWorkflowSrc.includes('$KILO_CONFIG_DIR'), 'workflow keeps KILO_CONFIG_DIR');
  });

  test('reapply-patches checks Kiro patch directories', () => {
    assert.ok(reapplyPatchesSrc.includes('$KIRO_CONFIG_DIR'), 'reapply checks KIRO_CONFIG_DIR');
    assert.ok(reapplyPatchesSrc.includes('$HOME/.kiro/gsd-local-patches'), 'reapply checks ~/.kiro patches');
    assert.ok(reapplyPatchesSrc.includes('for dir in .kiro'), 'reapply checks local .kiro patches');
  });
});
