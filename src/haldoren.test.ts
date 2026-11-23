import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractPureFunctions(sourceHtml: string) {
  const match = sourceHtml.match(/\/\* Pure layout & motion functions \*\/([\s\S]*?)\/\* DOM references \*\//);
  assert.ok(match, 'Pure layout & motion functions block must exist in index.html');
  const sandbox: Record<string, unknown> = {};
  vm.runInNewContext(
    `${match[1]}\nthis.computePose = computePose; this.computeFitHero = computeFitHero; this.playbackRateCurve = playbackRateCurve;`,
    sandbox
  );
  return sandbox as {
    computePose: (
      mode: 'hero' | 'case',
      W: number,
      H: number,
      ticketHeight: number,
      descHeight: number
    ) => { s: number; x: number; y: number; mobile: boolean };
    computeFitHero: (
      p: { s: number; x: number; y: number },
      W: number,
      H: number
    ) => {
      wmLeft: number;
      wmWidth: number;
      badgeLeft: number;
      badgeTop: number;
      scriptLeft: number;
    };
    playbackRateCurve: (p: number) => number;
  };
}

const { computePose, computeFitHero, playbackRateCurve } = extractPureFunctions(html);

test('index.html is a standalone single-file page with no external framework bundles', () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'No external script src tags should exist');
  assert.match(html, /<title>Haldoren — Motion Design Portfolio<\/title>/);
  assert.match(html, /Inter\+Tight:wght@100\.\.900/);
  assert.match(html, /Caveat\+Brush/);
  assert.match(html, /Anton/);
});

test('all exact asset URLs and required copy strings are present verbatim', () => {
  const required = [
    'https://images.higgs.ai/?default=1&output=webp&url=',
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/',
    'hf_20261111_001031_a09dc558-2c69-4e05-83a4-5f01ebdd1363.png',
    'hf_20261111_001031_4a7c3fd9-2168-4219-9736-096a17bbb0e2.png',
    'hf_20261111_001143_ec356b1a-50a2-4b50-82fc-e346c914a406.png',
    'hf_20261111_001143_65c037e6-0768-4b12-9f17-17be132ce16b.png',
    'hf_20261111_001144_2b054228-95af-41d5-922d-b02979fe485b.mp4',
    'https://pub-86dc5b5484314368ac5436a674b0d919.r2.dev/aaaf/',
    'vell-lookbook.mp4',
    'vasari-vhs-hero.mp4',
    'living-portrait-hero.mp4',
    'VELL LOOKBOOK',
    'VASARI SHELF',
    'MINA PORTRAIT',
    'E. HALDOREN',
    'ART DIRECTOR // DESIGNER',
    '@HALDOREN.MOTION',
    'HI@HALDOREN.STUDIO',
    'scroll into the work',
    'motion-design',
    'my studio',
    'portfolio',
    'contacts',
    'discuss a project',
  ];
  for (const needle of required) {
    assert.ok(html.includes(needle), `Missing required string: ${needle}`);
  }
});

test('desktop hero pose covers 1440x900 and anchors top', () => {
  const p = computePose('hero', 1440, 900, 182, 120);
  assert.equal(p.mobile, false);
  assert.ok(Math.abs(p.s - 900 / 810) < 1e-6);
  assert.ok(Math.abs(p.x - -80) < 1e-6);
  assert.equal(p.y, 0);

  const fit = computeFitHero(p, 1440, 900);
  assert.ok(fit.wmLeft > 70 && fit.wmLeft < 90);
  assert.ok(fit.wmWidth > 1250 && fit.wmWidth < 1300);
  assert.ok(fit.badgeLeft <= 986);
  assert.ok(fit.badgeTop <= -165);
  assert.ok(fit.scriptLeft > fit.wmLeft);
});

test('desktop case pose fits laptop cleanly on standard and short viewports', () => {
  const std = computePose('case', 1440, 900, 182, 120);
  assert.equal(std.mobile, false);
  assert.ok(std.y + 79 * std.s >= 60);
  assert.ok(std.y + 762 * std.s <= 900);

  const short = computePose('case', 1440, 680, 150, 100);
  assert.equal(short.mobile, false);
  assert.ok(short.s < 1, 'Laptop should scale down on short viewports');
  const laptopTop = short.y + 79 * short.s;
  const laptopBottom = short.y + 762 * short.s;
  assert.ok(laptopTop >= 45, `Laptop top (${laptopTop}) clears nav`);
  assert.ok(laptopBottom <= 680 - 15, `Laptop bottom (${laptopBottom}) clears bottom edge`);
});

test('mobile hero and case poses keep man bottom-anchored and laptop below UI', () => {
  const hero = computePose('hero', 390, 844, 150, 76);
  assert.equal(hero.mobile, true);
  assert.ok(Math.abs(hero.s - 390 / 650) < 1e-6);
  assert.ok(hero.y > 300);

  const cs = computePose('case', 390, 844, 150, 76);
  assert.equal(cs.mobile, true);
  assert.ok(cs.y >= hero.y, 'Camera should glide down slightly into laptop on mobile');
  const laptopTop = cs.y + 79 * cs.s;
  const uiBottom = 62 + 150 + 18 + 76 + 14;
  assert.ok(laptopTop >= uiBottom, `Laptop top (${laptopTop}) must sit below mobile UI (${uiBottom})`);
});

test('playbackRateCurve peaks near 4.2x and integrates 5.04s clip to ~1.72s', () => {
  assert.ok(Math.abs(playbackRateCurve(0) - 1.8) < 1e-6);
  const peak = playbackRateCurve(0.5 / 1.08);
  assert.ok(Math.abs(peak - 4.2) < 1e-3, `Expected peak near 4.2, got ${peak}`);
  assert.ok(playbackRateCurve(1) >= 1.2);

  // Numerical integration of elapsed real time for 5.04s clip
  const steps = 10000;
  const clipDur = 5.04;
  const dp = 1 / steps;
  let realTime = 0;
  for (let i = 0; i < steps; i++) {
    const p = (i + 0.5) * dp;
    realTime += (clipDur * dp) / playbackRateCurve(p);
  }
  assert.ok(realTime > 1.55 && realTime < 1.9, `Expected ~1.72s real playback time, got ${realTime.toFixed(3)}s`);
});
