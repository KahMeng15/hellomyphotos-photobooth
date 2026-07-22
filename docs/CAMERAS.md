# Camera Support — DSLR & Mirrorless

hellomyphoto supports professional DSLR and mirrorless cameras connected via USB,
in addition to the built-in webcam mode. Live preview frames are streamed from
the camera at ~15 FPS, and the actual hardware shutter fires for each capture.

---

## Supported Cameras

Any camera supported by **gphoto2** (macOS / Linux) or **DigiCamControl** (Windows)
will work. The following have been tested with this booth:

| Camera | Platform | Notes |
|---|---|---|
| Canon EOS 80D | macOS, Windows | USB 2.0, JPEG tested |
| Sony A7RII | macOS, Windows | USB 2.0, JPEG mode required |

For the full gphoto2 compatibility list: https://gphoto.org/proj/libgphoto2/support.php  
For DigiCamControl: http://digicamcontrol.com/cameras

---

## Platform Prerequisites

### macOS

Install gphoto2 via Homebrew:

```bash
brew install gphoto2
```

Verify the camera is detected:

```bash
gphoto2 --auto-detect
```

Expected output (example):
```
Model                          Port
----------------------------------------------------------
Canon EOS 80D                  usb:020,006
```

> **Important — kill the macOS PTP daemon**
>
> macOS automatically mounts cameras as PTP devices via `PTPCamera`. This
> conflicts with gphoto2. Kill it before starting the booth, or whenever you
> plug in the camera:
>
> ```bash
> killall PTPCamera 2>/dev/null; killall Image\ Capture\ Extension 2>/dev/null
> ```
>
> You can add this to a launch script so it runs automatically.

---

### Windows

1. Download and install **DigiCamControl** (free, open-source):  
   http://digicamcontrol.com/download

2. Launch DigiCamControl — it will appear in the system tray (📷 icon).

3. In DigiCamControl's settings, ensure the HTTP server is enabled on port **5513**
   (this is the default).

4. Plug in your camera via USB. DigiCamControl should detect it automatically.

5. Start the hellomyphoto booth client. The booth communicates with
   DigiCamControl over `http://localhost:5513`.

> **Note:** DigiCamControl must be running before you launch the booth, and
> must remain running throughout the session.

---

## Camera Configuration Checklist

Before your event, set the following on the camera body (not software):

| Setting | Recommended Value | Reason |
|---|---|---|
| Image quality | **JPEG Fine** (or RAW+JPEG if you want RAW archives) | Fast USB transfer |
| Image size | **L** (full resolution) | Best quality |
| Auto-power off / Sleep | **Disabled / Never** | Prevents camera sleeping mid-session |
| Focus mode | **AF-S / One-Shot** | Reliable per-shot focus |
| Drive mode | **Single shot** | Prevents burst-mode conflicts |
| USB connection mode | **PTP** (Canon) / **MTP** (Sony — use PC Remote) | Required for gphoto2 / DigiCamControl |

### Sony A7RII specific

- Set `USB Connection` → **PC Remote (MTP-NFS)**
- Set `PC Remote Settings` → `Still Img Save Dest` → **PC and Camera** (saves to both SD + PC)
- Disable `Auto Review` to speed up capture cycles

### Canon EOS 80D specific

- Set `Interface` → `Digital terminal` → **PC connect**
- In the camera menu, ensure `Save-to` is set to **Both** when using gphoto2 with `--keep`

---

## Selecting Camera Mode in the Booth

1. Open the booth client.
2. Press **Cmd+Shift+S** (macOS) or **Ctrl+Shift+S** (Windows) to open Settings.
3. Under **Camera Source**, select **DSLR / Mirrorless (USB)**.
4. Click **Scan for Camera** — the detected camera model will appear.
5. Click **Save**.

The booth will now use the live DSLR preview and fire the hardware shutter for
every capture. The webcam device dropdown is hidden in DSLR mode.

---

## How It Works (Technical)

```
Live preview (15 FPS)
  macOS:   gphoto2 --capture-preview → JPEG file → base64 → IPC → <img> element
  Windows: HTTP GET localhost:5513/liveview.jpg every 67ms → base64 → IPC → <img>

Capture (per shot)
  1. Renderer stops liveview frame listener
  2. Main process: stop liveview → fire shutter → download JPEG → resume liveview
     macOS:   gphoto2 --capture-image-and-download --keep
     Windows: HTTP GET localhost:5513/camera1/capturenoaf
  3. Renderer shows "Processing…" overlay
  4. JPEG path returned to renderer → flash effect → post-capture preview
  5. Liveview resumes for next shot

Disconnect detection
  Main process polls gphoto2 --auto-detect (or DigiCamControl API) every 5 s
  If camera disappears → 'dslr-disconnected' IPC event → error overlay with Retry
```

---

## Troubleshooting

### Camera not detected on macOS

1. Make sure the USB cable is securely connected.
2. Kill the macOS PTP daemon: `killall PTPCamera`
3. Run `gphoto2 --auto-detect` in a terminal — if the camera appears here but
   not in the booth, restart the booth client.
4. Try a different USB cable or port (USB-A 3.0 ports sometimes have issues).

### "capture failed" errors

- Ensure the camera is not in sleep mode (see Camera Configuration Checklist).
- On Sony cameras, confirm `PC Remote` USB mode is selected on the camera body.
- Try setting a longer countdown (7+ seconds) to give the camera time to wake.

### Liveview shows a black / blank image on macOS

- The PTP daemon may have grabbed the camera before gphoto2 could. Run:
  ```bash
  killall PTPCamera && killall Image\ Capture\ Extension
  ```
  Then click **Scan for Camera** in Settings.

### DigiCamControl not responding (Windows)

- Ensure DigiCamControl is running (check system tray).
- Open a browser and visit `http://localhost:5513/camera1/` — you should see
  a JSON object with camera info. If not, check DigiCamControl's HTTP server setting.
- Restart DigiCamControl, then restart the booth client.

### Images saved to SD card but not PC

- macOS: gphoto2 uses `--keep` automatically. If files are missing, check the
  temp directory (`/var/folders/.../...` shown in the terminal logs).
- Windows: DigiCamControl saves to its configured `Download folder`
  (usually `Documents\digiCamControl\Photos`).

---

## File Paths

Downloaded captures are stored in the OS temp directory:

- **macOS:** `$TMPDIR` (e.g. `/var/folders/xx/.../T/`)
- **Windows:** `%TEMP%` (e.g. `C:\Users\YourName\AppData\Local\Temp`)

Files are named `booth_YYYYMMDD_HHMMSS.jpg` and uploaded to the server
automatically. They remain on disk until the OS clears the temp directory.
