process.env.GSD_TEST_MODE = '1';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

const {
  getDirName,
  getGlobalDir,
  getConfigDirFromHome,
  convertClaudeToKiroFrontmatter,
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
