# Homebrew Treadmill Console

A custom touchscreen console for a Precor TRM 885 treadmill, replacing the stock P80 workout screen. It runs on an Amazon Fire HD 10 (11th gen) in landscape.

**Status: v0.2, simulator only.** The app runs against a simulated treadmill. The real hardware driver (an ESP32 bridge on the console data cable) comes after the data-cable capture. The full requirements live in the Claude project doc `treadmill-app-requirements.md`; requirement IDs (M3, S4, …) in code comments refer to it.

> **Safety:** the on-screen Stop button is a convenience. The real stops are the lanyard and physical buttons wired to the controller (requirements S1, S5), and hard speed/incline limits live in the controller firmware (S3). Nothing in this app is a safety boundary.

## What works now

Two workout views, switched with the tabs in the status bar:

**Control Center**
- Sized for a 10" landscape tablet: speed lane (left), data fields and Start/Pause/Lap (centre), incline lane (right)
- Separate step buttons with hold-to-repeat: ±1 and ±0.1 mph, ±0.5 % incline
- Speed presets (Rest 3.0 / Recovery 7.0 / Run 11.0 mph) and incline presets (Flat / Road / Hill)
  - **Tap** to go to a preset. While that lane's **Lap on tap** switch is on (the default), the tap also splits a lap. Each lane has its own switch in its header.
  - **Hold** for 0.7 s to save the current setting into the preset: the belt's target speed (or the last one while paused) for speed, the target incline for incline. A bar fills while you hold and the button shows "Saved".
  - **Edit** opens −/+ fine-tuning and "Set to current".
- Target vs. actual for speed and incline; the target pill lights up while the belt or deck is still catching up
- Laps, six configurable data fields (tap a tile to change it), including heart rate, average HR and lap average HR

**Charts**
- Pace/speed, incline, time and distance across the top
- Bottom left: **Recover** button, a **speed wheel**, and a **Run** button
  - Drag the wheel sideways to change speed in 0.1 mph steps (dragging left speeds up). While the belt is running it drives the belt directly; while stopped or paused it only sets a value. It moves only while touched, with no fling momentum, so a flick can't keep spinning the speed up. Arrow keys and a mouse scroll wheel also work, for testing on a computer.
  - **Tap** Recover or Run to jump to that preset. By default this also splits a lap; turn that off with **Lap on Run and Recover** in Settings.
  - **Hold** Recover or Run for 0.7 s to save the wheel's current speed into that preset. A bar fills along the bottom while you hold, and the button shows "Saved".
- Bottom centre: Pause/Lap (Resume/End when paused). Bottom right: incline steps
- Lap splits down the left: current lap on top, completed laps newest-first with Strava-style bars (longer = faster), lap time, pace, distance and average HR
- Live graph of speed, incline and heart rate, with alternating grey bands for laps and each lap's time, pace, distance and average HR at the bottom of its band
- Ranges: **5 min**, **15 min** (default) and **Full**. The x-axis starts at 0–6 min. After 5 minutes, 5 min slides a 6-minute window, 15 min zooms out until it shows 15 minutes then slides, and Full keeps zooming out. All y-axes rescale to the visible data and share gridlines.
- **Looking back and point-in-time readings**
  - In 5 and 15 min, drag the graph right to look back. A cursor stays where the live line is normally drawn (1 min in from the right edge), and the data slides under it. A readout beside it shows time, lap, pace (or speed), incline and bpm at that moment.
  - Once the view reaches the start of the workout, a tap shows the readings under your finger. A swipe that starts toward the start keeps the cursor under your finger; a swipe that starts toward the present scrolls back toward live. One long swipe does the same: when the view hits the start, the cursor detaches and follows your finger.
  - When everything already fits (Full, or early on), tapping or dragging just moves the cursor. Letting go at the live edge clears it.
  - **Returning to live:** while running, the graph returns after 10 s untouched, with a "Graph returns in N" bar that shortens across the top. While paused, it stays put until you swipe back to the live end, tap **Back to live**, or resume (resuming returns immediately).
  - Recording is unaffected: scroll position and cursor are display-only.

**Both**
- Pause/resume, end-of-workout summary with lap splits
- Every workout is saved on the device. An in-progress workout survives a crash or reload and comes back paused.
- Miles/km, pace or speed as the big readout, start speed, decline limit
- Screen stays on during a workout (browser Wake Lock API)
- **Simulator** panel: pull the lanyard, drop the connection, reconnect, take the HR strap on or off, and run the simulation at 10× or 30× speed so you can watch the graph zoom out without running for 15 minutes. A "10× time" badge shows in the status bar whenever it's sped up.
- **Simulated heart rate** (until a Bluetooth strap is supported): ACSM oxygen-cost equations for speed and grade, converted to heart rate via %VO₂ reserve ≈ %HR reserve, with a lag that's faster going up than coming down. The profile (rest 55, max 190, VO₂max 68) is a placeholder, not anyone's real physiology.

## Run it on your Mac

You need Node.js 20.19 or newer (`node -v` to check; install from nodejs.org if needed).

```bash
git clone https://github.com/kwmck96/Homebrew-Treadmill-Console.git
cd Homebrew-Treadmill-Console
npm install
npm run dev
```

Vite prints two URLs:

- **Local** (`http://localhost:5173/`): open on the Mac. Use Chrome's device toolbar (⌥⌘I, then the phone/tablet icon) and set a 1280 × 800 viewport to approximate the Fire tablet.
- **Network** (`http://192.168.x.x:5173/`): open this in the Fire tablet's Silk browser while it's on the same Wi-Fi. Edits on the Mac reload on the tablet instantly.

## Deploy to Vercel (for testing on the tablet anywhere)

1. In Vercel, **Add New → Project**, import `kwmck96/Homebrew-Treadmill-Console`.
2. Vercel detects Vite. Leave the defaults (build `npm run build`, output `dist`) and deploy.
3. Every push to `main` redeploys; every pull request gets its own preview URL, which is the easiest way to try a change on the tablet before merging.

The final app runs offline as an installed APK (requirement C2). Vercel is only for development.

## Checks

```bash
npm test          # unit tests (simulator, workout math, storage)
npm run typecheck # TypeScript
npm run lint      # oxlint
npm run check     # all three
```

## How it's organised

```
src/
  treadmill/   Hardware abstraction. types.ts defines TreadmillDriver; simulator.ts implements it.
               The real ESP32 driver will be a second implementation here.
  workout/     engine.ts: pure workout math (distance, elevation, laps, pause)
               store.ts: wires driver + engine + storage together; owns the timer loop
               persistence.ts: IndexedDB storage; fields.ts: the data-field definitions
  settings/    User settings (presets, units, fields), saved in localStorage
  lib/units.ts Unit conversion and formatting
  heartrate/   HeartRateSource interface and the simulated strap (model.ts is the physiology)
  charts/      Chart math: visible time window, panning, y-scales, thinning long workouts,
               and inspect.ts (look-back gestures and point-in-time readings)
  ui/          React components; ui/charts/ holds the Charts view and its canvas renderer
```

The UI never talks to hardware directly; it calls the store, and the store calls whichever `TreadmillDriver` is selected in `workout/store.ts`. Swapping the simulator for the real bridge is a one-line change there.

Internal units: speed in mph and incline in % (the treadmill's native control units), distance and elevation in metres, time in milliseconds.

## Behaviour decisions worth knowing

- **Start and Resume always begin at the start speed** (1.0 mph by default), never at the previous speed, so the belt never jumps from rest to a run pace on its own. Resume waits until the belt has fully stopped.
- **Pause stops the belt.** The clock stops immediately; distance keeps counting while the belt decelerates.
- If the lanyard is pulled, the connection drops, or the belt stops without the app asking (e.g. a physical stop button), the workout pauses automatically.
- **End workout** and **Discard** need a second tap within 3 seconds.
- Speed and incline buttons only work while a workout is running and the belt is moving.
- Elevation uses the deck's grade along the belt: vertical = distance × sin(atan(grade)).

## Placeholders to replace with real measurements

| What | Where | Current value |
|---|---|---|
| Belt acceleration / deceleration | `treadmill/simulator.ts` | 1.0 / 1.5 mph per s (guesses) |
| Incline motor speed | `treadmill/simulator.ts` | 0.5 % per s (guess) |
| Incline presets | Settings defaults | Flat 0 %, Road 1 %, Hill 4 % |
| −3 % decline | Settings | Assumed per Precor spec; unconfirmed on this V1 |
| Heart-rate profile | `heartrate/model.ts` | Rest 55, max 190, VO₂max 68 (simulator only) |

## Not built yet

Diagnostics screen (D1/D2), workout history list, workout builder (H4), auto-lap (H5), a real Bluetooth heart-rate strap (H1; simulated for now), calibration factor (H2), music controls (H3), Capacitor APK packaging, and the real treadmill driver.
