const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempDir = '/tmp/dslr-test';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

function killPtp() {
  log('Killing macOS PTP daemons...');
  try {
    execSync('launchctl bootout gui/$(id -u) /System/Library/LaunchAgents/com.apple.ptpcamerad.plist 2>/dev/null || true');
    execSync('launchctl bootout gui/$(id -u) /System/Library/LaunchAgents/com.apple.imagecaptured.plist 2>/dev/null || true');
    execSync('pkill -9 -f PTPCamera 2>/dev/null || true');
    execSync('pkill -9 -f imagecaptured 2>/dev/null || true');
    execSync('pkill -9 -f "Image Capture" 2>/dev/null || true');
    log('Killed PTP daemons.');
  } catch (err) {
    log('Error killing PTP daemons (might already be dead).');
  }
}

async function testDetect() {
  log('--- TEST: DETECT ---');
  return new Promise((resolve) => {
    const proc = spawn('gphoto2', ['--auto-detect']);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', code => {
      log(`Detect exited with code ${code}`);
      log(`Output:\n${out.trim()}`);
      resolve(code === 0 && out.includes('usb:'));
    });
  });
}

async function testLiveview() {
  log('\n--- TEST: LIVEVIEW ---');
  const frameFile = path.join(tempDir, `lv_test.jpg`);
  
  for (let i = 1; i <= 5; i++) {
    log(`Liveview attempt ${i}/5...`);
    killPtp();
    
    const success = await new Promise((resolve) => {
      const proc = spawn('gphoto2', ['--capture-preview', `--filename=${frameFile}`, '--force-overwrite']);
      let stderr = '';
      proc.stderr.on('data', d => stderr += d.toString());
      
      const timeout = setTimeout(() => {
        log('Attempt timed out, killing gphoto2...');
        proc.kill('SIGKILL');
        resolve(false);
      }, 5000);
      
      proc.on('close', code => {
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(frameFile)) {
          const stats = fs.statSync(frameFile);
          log(`✅ SUCCESS! Got frame of size ${stats.size} bytes`);
          resolve(true);
        } else {
          log(`❌ FAILED (code ${code}). Stderr: ${stderr.trim()}`);
          resolve(false);
        }
      });
    });

    if (success) return true;
    log('Waiting 1 second before next attempt...');
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function testCapture() {
  log('\n--- TEST: CAPTURE ---');
  const captureFile = path.join(tempDir, `capture_test.%C`);
  killPtp();
  
  return new Promise((resolve) => {
    const args = [
      '--capture-image-and-download',
      '--keep',
      `--filename=${captureFile}`,
      '--force-overwrite'
    ];
    log(`Running: gphoto2 ${args.join(' ')}`);
    const proc = spawn('gphoto2', args);
    
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => out += d.toString());
    
    proc.on('close', code => {
      if (code === 0) {
        log(`✅ SUCCESS! Capture exited cleanly.`);
        log(`Output:\n${out.trim()}`);
        resolve(true);
      } else {
        log(`❌ FAILED with code ${code}. Output:\n${out.trim()}`);
        resolve(false);
      }
    });
  });
}

async function run() {
  log('Starting DSLR Tests...');
  const detected = await testDetect();
  if (!detected) {
    log('Camera not detected, stopping tests.');
    return;
  }
  
  const lvOk = await testLiveview();
  if (lvOk) {
    // Let's run a capture test immediately after
    await testCapture();
  } else {
    log('Skipping capture test since liveview completely failed to claim the camera.');
  }
  log('\nTests completed.');
}

run();
