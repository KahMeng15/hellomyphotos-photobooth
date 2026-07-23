#!/usr/bin/env node
/**
 * Sony A7 III / Alpha Camera Diagnostic Script v2
 *
 * Tests liveview approaches both WITH and WITHOUT explicit --port flag,
 * since gphoto2 --reset changes the USB port after each call.
 *
 * Usage: node test-sony-diagnostics.js
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP = '/tmp/dslr-diag';
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const ts = () => new Date().toISOString().slice(11, 23);
const log = (msg) => console.log(`[${ts()}] ${msg}`);
const hr = () => console.log('\n' + '─'.repeat(72) + '\n');

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: false });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, error: err.message });
    });
  });
}

function killPtpCamera() {
  try {
    const uid = `gui/$(id -u)`;
    execSync(
      `launchctl disable ${uid}/com.apple.ptpcamerad 2>/dev/null; ` +
      `launchctl disable ${uid}/com.apple.imagecaptured 2>/dev/null; ` +
      `launchctl bootout ${uid} /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null; ` +
      `launchctl bootout ${uid} /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null; ` +
      `pkill -9 -f PTPCamera 2>/dev/null; ` +
      `pkill -9 -f ptpcamerad 2>/dev/null; ` +
      `pkill -9 -f imagecaptured 2>/dev/null; ` +
      `gphoto2 --reset 2>/dev/null; ` +
      `exit 0`,
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function detect() {
  const r = await run('gphoto2', ['--auto-detect'], 5000);
  let port = null;
  const lines = r.stdout.split('\n').filter(l => l.includes('usb:'));
  if (lines.length > 0) {
    const parts = lines[0].split('usb:');
    port = 'usb:' + (parts[1] || '').trim();
  }
  return port;
}

async function testGetConfig(usePort) {
  const args = ['--get-config', 'iso'];
  if (usePort) {
    const p = await detect();
    if (!p) return { success: false, error: 'no camera' };
    args.push(`--port=${p}`);
  }
  log(`Running: gphoto2 ${args.join(' ')}`);
  const r = await run('gphoto2', args, 5000);
  if (r.code === 0 && r.stdout.includes('Current')) {
    const current = r.stdout.split('\n').find(l => l.startsWith('Current'));
    log(`✅ exit=0, Current: ${current ? current.trim() : '(ok)'}`);
    return { success: true };
  }
  log(`❌ code=${r.code}${r.timedOut ? ' (TIMEOUT)' : ''} stderr: ${r.stderr.trim().slice(0, 100)}`);
  return { success: false, error: r.stderr };
}

async function testCapturePreview(usePort, label) {
  log(`\n--- CAPTURE-PREVIEW: ${label} ---`);
  let port = null;
  if (usePort) {
    port = await detect();
    if (!port) { log('❌ Cannot detect camera'); return false; }
  }

  const tmpFile = path.join(TMP, `preview_${Date.now()}.jpg`);
  const args = ['--capture-preview', `--filename=${tmpFile}`, '--force-overwrite'];
  if (port) args.push(`--port=${port}`);
  log(`Running: gphoto2 ${args.join(' ')}`);
  const r = await run('gphoto2', args, 8000);

  if (r.code === 0 && fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 500) {
    log(`✅ SUCCESS! ${(fs.statSync(tmpFile).size / 1024).toFixed(1)} KB`);
    return true;
  }
  const exists = fs.existsSync(tmpFile);
  log(`❌ code=${r.code}${r.timedOut ? ' (TIMEOUT)' : ''} file=${exists ? fs.statSync(tmpFile).size + 'b' : 'not found'}`);
  if (r.stderr.trim()) log(`   stderr: ${r.stderr.trim().slice(0, 150)}`);
  return false;
}

async function testMjpeg(usePort) {
  log(`\n--- MJPEG STREAM: ${usePort ? 'WITH --port' : 'WITHOUT --port'} ---`);
  return new Promise((resolve) => {
    let frameCount = 0, chunks = 0;

    const args = ['--capture-movie', '--stdout'];
    if (usePort) {
      detect().then(p => {
        if (p) args.push(`--port=${p}`);
        startStream(p);
      }).catch(() => startStream(null));
    } else {
      startStream(null);
    }

    function startStream(port) {
      log(`Running: gphoto2 ${args.join(' ')}`);
      const proc = spawn('gphoto2', args);

      proc.stderr.on('data', (d) => {
        const txt = d.toString();
        if (chunks === 0) log(`  gphoto2: ${txt.trim()}`);
      });

      proc.stdout.on('data', (chunk) => {
        chunks++;
        const buf = Buffer.from(chunk);
        let idx = buf.indexOf(Buffer.from([0xff, 0xd8]));
        while (idx !== -1) {
          const end = buf.indexOf(Buffer.from([0xff, 0xd9]), idx + 2);
          if (end !== -1) {
            frameCount++;
            const frame = buf.slice(idx, end + 2);
            if (frameCount === 1) {
              log(`✅ First frame! ${frame.length} bytes (after ${chunks} chunks)`);
              fs.writeFileSync(path.join(TMP, 'mjpeg_first_frame.jpg'), frame);
            }
            idx = buf.indexOf(Buffer.from([0xff, 0xd8]), end + 2);
          } else break;
        }
      });

      setTimeout(() => {
        proc.kill('SIGINT');
        log(`Result: ${frameCount} frames, ${chunks} data chunks`);
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch {}; resolve(frameCount); }, 1500);
      }, 8000);
    }
  });
}

async function testCaptureImage(usePort) {
  log(`\n--- CAPTURE IMAGE: ${usePort ? 'WITH --port' : 'WITHOUT --port'} ---`);
  let port = null;
  if (usePort) {
    port = await detect();
    if (!port) { log('❌ Cannot detect camera'); return false; }
  }

  const tmpFile = path.join(TMP, `capture_${Date.now()}.%C`);
  const args = ['--capture-image-and-download', '--keep', `--filename=${tmpFile}`, '--force-overwrite'];
  if (port) args.push(`--port=${port}`);
  log(`Running: gphoto2 ${args.join(' ')}`);
  const r = await run('gphoto2', args, 30000);

  if (r.code === 0) {
    const files = fs.readdirSync(TMP).filter(f => f.startsWith('capture_'));
    if (files.length) {
      log(`✅ Captured: ${files.join(', ')}`);
      return true;
    }
  }
  log(`❌ code=${r.code}${r.timedOut ? ' (TIMEOUT)' : ''} stderr: ${r.stderr.trim().slice(0, 100)}`);
  return false;
}

async function testPreviewWithConfig(usePort, configPath, configValue) {
  log(`\n--- SET-CONFIG ${configPath}=${configValue} + CAPTURE-PREVIEW ---`);
  let port = null;
  if (usePort) {
    port = await detect();
    if (!port) { log('❌ Cannot detect camera'); return false; }
  }

  const setArgs = ['--set-config', `${configPath}=${configValue}`];
  if (port) setArgs.push(`--port=${port}`);
  log(`  gphoto2 ${setArgs.join(' ')}`);
  const setR = await run('gphoto2', setArgs, 5000);
  if (setR.code === 0) {
    log(`  ✅ set-config OK`);
  } else {
    log(`  ⚠️  set-config: code=${setR.code}${setR.timedOut ? ' TIMEOUT' : ''} ${setR.stderr.trim().slice(0, 80)}`);
  }

  const tmpFile = path.join(TMP, `preview_${Date.now()}.jpg`);
  const args = ['--capture-preview', `--filename=${tmpFile}`, '--force-overwrite'];
  if (port) args.push(`--port=${port}`);
  log(`  gphoto2 ${args.join(' ')}`);
  const r = await run('gphoto2', args, 8000);

  if (r.code === 0 && fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 500) {
    log(`✅ SUCCESS! ${(fs.statSync(tmpFile).size / 1024).toFixed(1)} KB`);
    return true;
  }
  const exists = fs.existsSync(tmpFile);
  log(`❌ code=${r.code}${r.timedOut ? ' (TIMEOUT)' : ''} file=${exists ? fs.statSync(tmpFile).size + 'b' : 'not found'}`);
  if (r.stderr.trim()) log(`   stderr: ${r.stderr.trim().slice(0, 150)}`);
  return false;
}

async function main() {
  log('🔬 Sony A7 III Diagnostics v2 — Tests WITH and WITHOUT --port');
  log(`Artifacts: ${TMP}\n`);

  // Step 1: Find initial port
  killPtpCamera();
  await sleep(2000);
  const initialPort = await detect();
  log(`Initial detect: port=${initialPort || 'NOT FOUND'}\n`);

  // Step 2: Test --get-config WITHOUT --port first
  hr();
  log('PART A: WITHOUT --port flag (let gphoto2 auto-detect)');
  log('═══════════════════════════════════════════════════════\n');

  // Kill PTPCamera first so the first command doesn't hit PTPCamera
  killPtpCamera();
  await sleep(2000);

  log('1. --get-config iso (no --port) — 5s timeout');
  const cfgNoPort = await testGetConfig(false);
  log(`   Result: ${cfgNoPort.success ? '✅' : '❌'}\n`);

  log('2. --capture-preview (no --port) — 8s timeout');
  const previewNoPort = await testCapturePreview(false, 'no --port');
  log(`   Result: ${previewNoPort ? '✅' : '❌'}\n`);

  log('3. --capture-movie --stdout (no --port) — 8s');
  const framesNoPort = await testMjpeg(false);
  log(`   Result: ${framesNoPort > 0 ? `✅ ${framesNoPort} frames` : '❌ 0 frames'}\n`);

  log('4. --capture-image-and-download (no --port) — 30s');
  const captureNoPort = await testCaptureImage(false);
  log(`   Result: ${captureNoPort ? '✅' : '❌'}\n`);

  // Step 3: Test WITH --port
  hr();
  log('PART B: WITH --port flag (freshly detected each call)');
  log('═══════════════════════════════════════════════════════\n');

  log('5. --get-config iso --port=... (fresh detect) — 5s');
  const cfgWithPort = await testGetConfig(true);
  log(`   Result: ${cfgWithPort.success ? '✅' : '❌'}\n`);

  log('6. --capture-preview --port=... (fresh detect) — 8s');
  const previewWithPort = await testCapturePreview(true, 'fresh --port');
  log(`   Result: ${previewWithPort ? '✅' : '❌'}\n`);

  log('7. --capture-movie --stdout --port=... — 8s');
  const framesWithPort = await testMjpeg(true);
  log(`   Result: ${framesWithPort > 0 ? `✅ ${framesWithPort} frames` : '❌ 0 frames'}\n`);

  log('8. --capture-image-and-download --port=... — 30s');
  const captureWithPort = await testCaptureImage(true);
  log(`   Result: ${captureWithPort ? '✅' : '❌'}\n`);

  // Step 4: Try config paths (no --port)
  hr();
  log('PART C: FIND CONFIG PATHS (no --port, 3s timeout each)');
  log('═══════════════════════════════════════════════════════\n');

  const configs = [
    'capture', '/main/actions/capture', '/main/actions/viewfinder',
    'iso', 'shutterspeed', 'aperture',
    '/main/capturesettings/capturetarget',
    '/main/status/preview',
  ];
  for (const cfg of configs) {
    const args = ['--get-config', cfg];
    log(`  gphoto2 ${args.join(' ')}`);
    const r = await run('gphoto2', args, 3000);
    if (r.code === 0 && r.stdout.includes('Current')) {
      const current = r.stdout.split('\n').find(l => l.startsWith('Current'));
      log(`  ✅ Supported. ${current ? current.trim() : ''}`);
    } else if (r.timedOut) {
      log(`  ⏱ Timed out`);
    } else {
      log(`  ❌ ${r.stderr.trim().slice(0, 80) || `code=${r.code}`}`);
    }
    await sleep(300); // Small delay between each
  }

  // Step 5: Try set-config + capture-preview (no --port)
  hr();
  log('PART D: SET-CONFIG + CAPTURE-PREVIEW (no --port)');
  log('═══════════════════════════════════════════════════════\n');

  await testPreviewWithConfig(false, 'capture', '1');
  await testPreviewWithConfig(false, '/main/actions/capture', '1');
  await testPreviewWithConfig(false, '/main/actions/viewfinder', '1');

  // Summary
  hr();
  log('══════════════════════════ SUMMARY ══════════════════════════');
  log(`  --get-config (no --port):        ${cfgNoPort.success ? '✅ Works' : '❌'}`);
  log(`  --get-config (with --port):      ${cfgWithPort.success ? '✅ Works' : '❌'}`);
  log(`  --capture-preview (no --port):   ${previewNoPort ? '✅' : '❌'}`);
  log(`  --capture-preview (with --port): ${previewWithPort ? '✅' : '❌'}`);
  log(`  MJPEG stream (no --port):        ${framesNoPort > 0 ? `✅ ${framesNoPort} frames` : '❌ 0'}`);
  log(`  MJPEG stream (with --port):      ${framesWithPort > 0 ? `✅ ${framesWithPort} frames` : '❌ 0'}`);
  log(`  --capture-image (no --port):     ${captureNoPort ? '✅' : '❌'}`);
  log(`  --capture-image (with --port):   ${captureWithPort ? '✅' : '❌'}`);

  hr();
  if (previewNoPort || previewWithPort) {
    log('✅ --capture-preview WORKS. The app can use it for liveview (polling mode).');
  } else {
    log('❌ --capture-preview does NOT work on this camera. Cannot get liveview frames.');
    log('   Consider using an HDMI capture card (Elgato Cam Link) for live preview.');
  }
  if (captureNoPort || captureWithPort) {
    log('✅ --capture-image-and-download WORKS. The app can take photos.');
  } else {
    log('❌ --capture-image-and-download does NOT work on this camera with gphoto2.');
  }
  log('');
}

main().catch(console.error);
