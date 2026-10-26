# Homebrew Treadmill Console

A custom touchscreen console for a Precor TRM 885 treadmill, replacing the stock P80 workout screen. It runs on an Amazon Fire HD 10 (11th gen) in landscape.

**Status: v0.3, simulator only.** The app runs against a simulated treadmill. The real hardware driver (an ESP32 bridge on the console data cable) comes after the data-cable capture. The full requirements live in the Claude project doc `treadmill-app-requirements.md`; requirement IDs (M3, S4, …) in code comments refer to it.

> **Safety:** the on-screen Stop button is a convenience. The real stops are the lanyard and physical buttons wired to the controller (requirements S1, S5), and hard speed/incline limits live in the controller firmware (S3). Nothing in this app is a safety boundary.

## What works now

Three views, switched with the tabs in the status bar: Control Center, Charts and Workout Builder.

**Control Center**
- Sized for a 10" landscape tablet: speed lane (left), data fields and Start/Pause/Take Split (centre), incline lane (right)
- Separate step buttons with hold-to-repeat: ±1 and ±0.1 mph, ±0.5 % incline
- Speed presets (Rest 3.0 / Recovery 7.0 / Run 11.0 mph) and incline presets (Flat / Road / Hill)
  - **Tap** to go to a preset. While that lane's **Lap on tap** switch is on (the default), the tap also splits a lap. Each lane has its own switch in its header.
  - **Hold** for 0.7 s to save the current setting into the preset: the belt's target speed (or the last one while paused) for speed, the target incline for incline. A bar fills while you hold and the button shows "Saved".
  - **Edit** opens −/+ fine-tuning and "Set to current".
- Target vs. actual for speed and incline; the target pill lights up while the belt or deck is still catching up
- Six configurable data fields: two full width on top (Time and Heart rate by default), then a 2 × 2 grid. Tap a field to pick a metric; picking one that's already on screen swaps the two.
- Heart rate is coloured on a scale: white ≤100, green 120, blue 140, yellow 160, orange 170, red ≥180 bpm (blended between)

**Charts**
- Pace/speed, incline, time, distance and heart rate (with the same colour scale) across the top
- Bottom left: **Recover** button, a **speed wheel**, and a **Run** button
  - Drag the wheel sideways to change speed in 0.1 mph steps (dragging left speeds up). While the belt is running it drives the belt directly; while stopped or paused it only sets a value. It moves only while touched, with no fling momentum, so a flick can't keep spinning the speed up. Arrow keys and a mouse scroll wheel also work, for testing on a computer.
  - **Tap** Recover or Run to jump to that preset. By default this also splits a lap; turn that off with **Lap on Run and Recover** in Settings.
  - **Hold** Recover or Run for 0.7 s to save the wheel's current speed into that preset. A bar fills along the bottom while you hold, and the button shows "Saved".
- Bottom centre: Pause/Take Split (Resume/End when paused). Bottom right: incline steps
- Lap splits down the left: current lap on top, completed laps newest-first with Strava-style bars (longer = faster), lap time, pace, distance and average HR
- Live graph of speed, incline and heart rate, with alternating grey bands for laps and each lap's time, pace, distance and average HR at the bottom of its band
- Ranges: **5 min**, **15 min** (default) and **Full**. The x-axis starts at 0–6 min. After 5 minutes, 5 min slides a 6-minute window, 15 min zooms out until it shows 15 minutes then slides, and Full keeps zooming out. All y-axes rescale to the visible data and share gridlines.
- **Looking back and point-in-time readings**
  - In 5 and 15 min, drag the graph right to look back. A cursor stays where the live line is normally drawn (1 min in from the right edge), and the data slides under it. A readout beside it shows time, lap, pace (or speed), incline and bpm at that moment.
  - Once the view reaches the start of the workout, a tap shows the readings under your finger. A swipe that starts toward the start keeps the cursor under your finger; a swipe that starts toward the present scrolls back toward live. One long swipe does the same: when the view hits the start, the cursor detaches and follows your finger.
  - When everything already fits (Full, or early on), tapping or dragging just moves the cursor. Letting go at the live edge clears it.
  - **Returning to live:** while running, the graph returns after 10 s untouched, with a "Graph returns in N" bar that shortens across the top. While paused, it stays put until you swipe back to the live end, tap **Back to live**, or resume (resuming returns immediately).
  - Recording is unaffected: scroll position and cursor are display-only.

**Workout Builder** (phase 1 of 3: building and saving; running a workout comes next)
- Elements: Warmup, Strides, Steady state, Intervals, Nested intervals, Hills, Rest, Active recovery, Cooldown. **Tap** one to add it at the end, or **drag** it into place; drag a block by its grip to reorder.
- Tap a block to edit it on the right:
  - **Duration:** time or distance (with 200 m / 400 m / 800 m / 1 km / 1 mi shortcuts).
  - **Target:** Pace, Heart rate (±4 %), HR zone (Z1–Z5 from max and resting HR, heart-rate-reserve method, or custom bounds), or Effort 1–10. Non-pace targets also take a starting pace. HR targets are greyed out without a strap.
  - **Incline:** combinable with any target.
- **Repeat blocks** set the repeat count, work step, and the recovery between repeats (active recovery or rest), plus "Include rest after final interval". **Nested intervals** add sets and a between-set recovery.
- **Rest** can be on the treadmill (belt slows to 2.5 mph, adjustable; distance keeps logging) or off it (time runs, distance doesn't; the belt keeps the next rep's speed). Choosing off shows a safety warning with Nevermind / I Understand.
- **Auto-start on HR:** a recovery or rest with an HR target can start the next rep 5 s after HR falls to the target; its duration becomes the maximum.
- **Estimates:**
  - Time and distance for each block and the whole workout. Elevation gain, loss and net change appear when any step is inclined.
  - HR, zone and effort steps count as unknown where speed matters, and the totals say how many weren't estimated.
  - Paces are rounded to the belt's 0.1 mph steps; the editor shows when that changes the pace (8:30/mi runs as 7.1 mph, 8:27/mi).
- **Library:** Add to Library (named), Save / Save as new for loaded workouts, Load, Delete. The draft in the builder survives closing the app. **Reset** asks first.
- Opening the builder during a run offers to pause first. **Start workout** is greyed out until the runner lands.
- Defaults: Warmup and Cooldown 10:00 at 8:30/mi; Strides 4 × 15 s at 5:00/mi with 75 s rest on the treadmill; Steady state 20:00 at 6:00/mi; Intervals 4 × 3:00 at 6:00/mi with 1:30 active recovery at 8:00/mi; Hills 6 × 1:00 at 6:40/mi and 4 % with 1:30 at 8:00/mi and 0 %; Nested 3 sets × 4 × 1:00 at 5:30/mi, 1:00 recovery, 3:00 between sets; Active recovery 3:00 at 8:00/mi; Rest 2:00 on the treadmill.

**Both**
- **Preset laps wait for the ramp.** When a preset tap splits a lap, the speed/incline change goes out immediately but the lap waits. An overlay shows the estimated speed and incline climbing to the new targets, then counts down 3-2-1 and starts the lap.
  - **Do not start new lap** cancels the lap and keeps the new speed and incline.
  - Wheel or step changes, or another preset tap, during the ramp re-target it (still one lap).
  - Pausing, Stop belt, the lanyard or a dropped connection cancel it. **Take Split** splits immediately and closes it.
  - The estimate uses `treadmill/rampRates.ts` (currently 2 mph/s and 1 %/s), and the countdown runs in real seconds even with the simulator sped up.
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
  plan/        Structured workouts: types, element defaults, expand (blocks → steps), estimates,
               the builder draft store and the IndexedDB library
  ui/          React components; ui/charts/ holds the Charts view, ui/builder/ the Workout Builder
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
- **Auto-lap** (Settings, on by default at 1.00 mi) splits a lap every set distance in every activity. It counts from the last split, so a manual or preset split restarts it, and the split is placed at the exact distance rather than on the next tick. It has its own unit (Miles or Meters, quick picks 0.25/0.5/1 mi or 400/1000/2000 m), so you can run in miles and split every 400 m. Switching only the auto-lap unit keeps the real distance (0.25 mi ↔ 400 m); switching the app's distance units carries the number across (1 mi → 1000 m). A workout can turn it off with **Disable auto-lap** in the builder; workout steps always split either way.

## Placeholders to replace with real measurements

| What | Where | Current value |
|---|---|---|
| Belt speed change rate | `treadmill/rampRates.ts` | 2 mph per s (estimate: ~0.5 s per 1 mph); used by the pending-lap overlay and the simulator |
| Incline motor speed | `treadmill/rampRates.ts` | 1 % per s (estimate: ~0.5 s per 0.5 %) |
| Incline presets | Settings defaults | Flat 0 %, Road 1 %, Hill 4 % |
| −3 % decline | Settings | Assumed per Precor spec; unconfirmed on this V1 |
| Heart-rate profile | `heartrate/model.ts` | Rest 55, max 190, VO₂max 68 (simulator only) |

## Not built yet

Running workouts from the builder (phase 2: workout mode banner, step timing, +15s/+30s recovery, Skip This Step, end-of-workout countdown; phase 3: HR/zone/effort coaching, HR auto-advance, step-change beeps), diagnostics screen (D1/D2), workout history list, auto-lap (H5), a real Bluetooth heart-rate strap (H1; simulated for now), calibration factor (H2), music controls (H3), Capacitor APK packaging, and the real treadmill driver.
