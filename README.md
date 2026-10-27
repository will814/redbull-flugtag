# 🐂✈️🏎️🎢🚲 Red Bull DIY Extreme Arcade 3D — 4-Game Engineering Sandbox

A 4-in-1 3D engineering builder and physics simulation arcade inspired by **Red Bull Flugtag**, **Red Bull Soap Box Derby**, **Red Bull Extreme Rollercoaster**, and **Red Bull Tandem Bike Challenge**. Built with React 19, Three.js, and Tailwind CSS v4 with responsive 2-thumb controls across phones (including the **Motorola Razr Foldable**), tablets, and Chromebooks.

- **🌐 Live Game (Firebase App Hosting):** [https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app](https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app)
- **📦 GitHub Repository:** [https://github.com/will814/redbull-flugtag](https://github.com/will814/redbull-flugtag)

---

## 🏟️ 4-Game Standalone Architecture

Each competition is architected as a completely isolated, purpose-built 3D engineering sandbox with its own workshop builder, interactive physics dyno rig, 6 specialized vehicle component sockets, custom launch platform, and 3-Judge scorecard, unified by a shared star-unlock progression economy.

### 0. Landing Page Arcade Hub (`src/ui/LandingPage.tsx`)
- **Interactive 4-Event Selector:** Displays live personal-best records (`FT`, race times, thrill scores), shared Judge Stars (`⭐`), and engineering specs for each competition:
  - **Launch Platform & Lab Dyno**
  - **6 Vehicle Component Slots**
  - **Signature Course Obstacles & Physics**
- **Instant Keyboard & Hash Navigation:** Press `1`, `2`, `3`, or `4` on the Landing Page to jump directly into **Flugtag**, **Soap Box Derby**, **Extreme Rollercoaster**, or **Red Bull Tandem Bike Challenge** (or navigate via `#flugtag`, `#soapbox`, `#coaster`, `#tandem`). Press `Esc` inside any workshop or click **`◀ Arcade Hub`** to return to the hub at any time.

---

### 1. ✈️ Game 1: Red Bull Flugtag (`src/flugtag/`)
- **Launch Platform:** **30-Ft Flight Deck Pier over Miami Bay** with a 90-ft sprint runway and glowing green trolley drop zone.
- **6 Aircraft Part Categories (`src/builder/PartCatalog.ts`):**
  - **Hulls (`chassis`):** Balsa Box Fuselage, Triple Pool Noodle Raft, Giant Hot Dog Cart, Clawfoot Porcelain Bathtub, and Carbon Teardrop Pod.
  - **Wings (`wings`):** Classic Balsa Glider Wings, Super-Wide Albatross Wings, Giant Cardboard Box Wings, Giant Pepperoni Pizza Wings, Midnight Bat Wings, Twin-Deck Biplane Wings, and Carbon Fiber Record Breakers.
  - **Tails (`tail`):** Aero Tail & Rudder, Twin V-Tail Feathers, Heavy Cardboard Boosters, and Rainbow Party Streamer Tail.
  - **Noses (`nose`):** Foam Nose Cone, Giant Quack Beak, Sizzling Kettle BBQ Grill (Nose Weight), Windmill Spin-Prop, and Fire Dragon Snout.
  - **Toppers (`topper`):** **Shadow** (Golden Retriever 🦮), **Boomer** (Black & White Great Dane 🐶), Lucky Rooster Mascot 🐓, El Grande Giant Taco 🌮, Living Room Party Couch 🛋️, Inflatable T-Rex Rider 🦖, Giant Sparkle Disco Ball 🪩, and King of the Pier Crown 👑.
  - **Launch Trolleys (`trolley`):** Speedy Skateboard Dolly, Supermarket Shopping Cart, and Pro Carbon Launch Rail.
- **Workshop Dyno — Wind Tunnel & CoG/CoL Gizmos:**
  - **3D Center of Gravity (`CoG`) vs. Center of Lift (`CoL`) Gizmos & Seesaw Indicator:** Immediately reveals whether the glider is a **Balanced Glider!**, **Nose Heavy (Dives!)**, or **Tail Heavy (Flips!)**, plus tracks the **400 lb Official Flugtag Weight Rule**.
  - **Interactive Wind Tunnel (`Test Wind`):** Spins up a giant 3D hangar fan with live airflow streamlines to test pitch torque and lift before rolling out to the pier.
- **120Hz Aerodynamic Flight & Thermals (`src/physics/AeroPhysicsEngine.ts`):**
  - **4-Phase Flight Loop:** Crew Dance Skit (`HYPE DANCE!`) $\rightarrow$ 90-ft Ramp Sprint & Timed Trolley Detach (`PUSH!!` $\rightarrow$ `DROP WHEELS!`) $\rightarrow$ 120Hz Airborne Glide with a live **Vertical Pitch Level Guide Gauge** (Green Sweet Spot vs. Stall/Nose-Dive zones), **Updraft Thermal Rings (`⭕`)**, and **Sea Breeze Gusts** toward the **258 ft World Record Buoys** $\rightarrow$ Buoyant water splashdown and 3-Judge Scorecard.

---

### 2. 🏎️ Game 2: Red Bull Soap Box Derby (`src/soapbox/`)
- **Launch Platform:** **Hilltop Start Pavilion & Hinged Steel Drop-Gate (`+110 ft` elevation)** with a 4-person pit crew push-bar sprint before dropping onto the steep Alpine descent.
- **6 Automotive Part Categories (`src/soapbox/SoapboxPartCatalog.ts`):**
  - **Chassis (`chassis`):** Pinewood Derby Plank, Bathtub Bobsled Tub, Carbon Monocoque Soapbox, Giant Hot Dog Bun Frame, Double-Decker Sofa Chassis.
  - **Steering Axle (`steering`):** Rope-and-Pulley Rack, Go-Kart Tie-Rod Direct Rack, Hydraulic Quick-Ratio Drift Rack, Shopping-Cart Caster Rack.
  - **Wheels & Tires (`wheels`):** Skinny Bicycle Spoke Wheels, Slick Racing Kart Tires, Knobby All-Terrain Rally Tires, Golden Cheese-Wedge Rollers.
  - **Suspension (`suspension`):** Rigid Hardwood Blocks, Dual Coil-Over Rally Shocks, Long-Travel Baja Air Shocks, Bouncy Pogo-Spring Struts.
  - **Brakes (`brakes`):** Rubber Shoe Drag-Spoon, Wooden Lever Scrub Pads, Vented Twin-Caliper Disc Brakes, Parachute + Spark-Skid Plate.
  - **Topper / Mascot (`topper`):** **Shadow** (Golden Retriever Co-Driver 🦮), **Boomer** (Great Dane Crew Chief 🐶), Giant Wedge of Swiss Cheese 🧀, Taco Truck Neon Sign 🌮, Roaring V8 Cardboard Blower 🔥, Disco Siren Lightbar 🪩.
- **Workshop Dyno — Road Shaker & Tilt Dyno Rig:**
  - Tests suspension compression, lateral center-of-gravity height, and **Rollover Tilt Angle (`°`)** on a live hydraulic shaker platform in the 3D Garage.
- **1,000-Ft Winding Gravity Road & Automotive Physics (`src/soapbox/SoapboxPhysicsEngine.ts`):**
  - **3D Ribbon Road:** Features asphalt & **Cobblestone Chatter Zones**, **Hay-Bale Chicanes**, **Soapy Water Slicks**, **Double Kicker Jumps**, a banked hairpin turn, and the **1,000-ft Red Bull Checkered Finish Arch**.
  - **120Hz Downhill Dynamics:** Simulates lateral tire grip vs. slip-angle **Drifting**, **Brake Fade & Heat Meter**, suspension bottoming on jump landings, hay-bale impact knockback, and **Lateral G Rollover** crashes.

---

### 3. 🎢 Game 3: Red Bull Extreme Rollercoaster (`src/coaster/`)
- **Launch Platform:** **Elevated Boarding Station & LIM Capacitor Launch Track** with pneumatic safety restraint lock and rhythmic **LIM Capacitor Charge** before magnetic launch.
- **6 Coaster Engineering Categories (`src/coaster/CoasterPartCatalog.ts`):**
  - **Car Chassis (`chassis`):** Mine-Cart Wooden Tub, Steel Hypercoaster Pod, Inverted Wing-Coaster Frame, Fiberglass Bobsled Bullet, Royal Dragon Coaster Car.
  - **Wheel Bogies (`wheels` — 3-Wheel-Set Upstop Clamping):** Nylon Park Rollers, Polyurethane High-Speed Bogies, **Triple-Clamped Steel Upstop Bogies** (Road + Side Guide + Under-Rail Upstop Wheels), Magnetic Mag-Lev Glider Bogies.
  - **Restraints (`restraints`):** Classic Buzz-Bar Lap Rod, Hydraulic Over-the-Shoulder Harness, Vest-Lock G-Force Restraint, Loose Rodeo Bull Strap.
  - **Nose Cone (`nose`):** Blunt Bumper Fairing, Needle Mach-Cone Fairing, Shark-Jaws Aero Nose, Golden Bull Horn Prow.
  - **LIM / Gyro Booster (`booster`):** Passive Gravity Flywheel, Copper LIM Stator Fin, Twin Supercapacitor Boost Pack, Overclocked Plasma Thruster.
  - **Shell / Topper (`topper`):** **Shadow** (Front-Row Coaster Hound 🦮), **Boomer** (Coaster Mascot 🐶), Screaming Rider Hands-Up Crew 🙌, Neon Cyber Fin Halo ⚡, Giant Red Bull Can Jetpack 🥫, Flaming Skull Hood Ornament 💀.
- **Workshop Dyno — Track Dyno Rig:**
  - Tests 3-wheel-set upstop clamping limits, aerodynamic drag, and G-force tolerance directly on a tubular steel test rail inside the Engineering Bay.
- **2,000-Ft 3D Spline Tubular Steel Track (`src/coaster/CoasterPhysicsEngine.ts`):**
  - **Signature Track Elements:**
    1. **LIM Launch Straight** (`0 – 220 ft`)
    2. **145-Ft Crest & 65° First Drop** (`220 – 520 ft`)
    3. **75-Ft 360° Vertical Loop** (`520 – 860 ft`) — requires sufficient entry speed so centripetal acceleration $v^2/R$ prevents stalling at the apex
    4. **50° Banked 3D Helix** (`860 – 1,220 ft`) — rider leans left/right to counter lateral Gs
    5. **Camelback Airtime Hills** (`1,220 – 1,500 ft`) — negative-G floater/ejector airtime
    6. **32-Ft Broken Rail Gap Jump** (`1,500 – 1,680 ft`) — ballistic jump across missing steel rails with pitch trim to re-engage the landing track
    7. **Lagoon Splashdown Trench & Golden Bullseye Brake Run** (`1,680 – 2,000 ft`) — water-scoop hydro-braking followed by precision eddy-current braking into the **`1,920 ft` Golden Bullseye Stop Zone**.

---

### 4. 🚲 Game 4: Red Bull Tandem Bike Challenge (`src/tandem/`)
- **Real-World Event Inspiration:** Modeled directly after the iconic Dutch water pier obstacle showdowns (*Red Bull Stalen Ros* / *Spin Off* / *Vél'Eau*). Two-person teams—a steering **Captain** in front and a power-pedaling **Stoker** in back—design outrageous custom tandem bicycles to navigate a treacherous, narrow obstacle pier suspended directly over canal waters.
- **Launch Platform:** **Launch Dock & Cadence Sync Deck** where the Captain and Stoker execute a pre-run crowd hype countdown, locking in initial pedaling synchrony (`85 RPM` dock boost) before dropping onto the beam.
- **6 Tandem Component Categories (`src/tandem/TandemPartCatalog.ts`):**
  - **Tandem Frames (`frame`):** Double-Diamond Steel Cruiser, Hydroformed Sport Alloy Tandem, Monocoque Carbon Aero Tandem, Heavy Hauler Truss Frame, Titanium Hydro-Truss Tandem, and Red Bull F1 Monocoque Spaceframe.
  - **Dual Drivetrains (`drivetrain`):** Dual-Chain Direct Sync, Lightweight Overdrive Cog, 21-Speed Index Derailleur, Sealed Dual Planetary Gearbox, Electronic Cadence Torque Multiplier, and Red Bull Ceramic Sprint Drive.
  - **Wheelset & Tires (`wheels`):** 26" Spoked Alloy Wheelset, 29" Sand & Float Paddle Tires, 700c Deep-V Aero Rims, Tri-Spoke Carbon Aero Blades, Magnesium Hydro-Blade Wheels, and Red Bull Ultra-Low Rolling Track Slicks.
  - **Steering & Handlebars (`steering`):** Twin Linked Cruiser Ape Bars, Drop-Bar Bullhorn Pursuit Bars, Wide MTB Low-Rise Trail Bars, High-Rise Chopper Ape Hangers, Low-Slung Dual Aero Clip-Ons, and Red Bull Dynamic Linked Bars.
  - **Stabilizers & Outriggers (`stabilizer`):** Dual Spring Training Outriggers, Bare Beam Balance (Pro Zero-Outrigger Mode), Twin Foam Pool Noodle Floats, Active Carbon Hydro-Skis, High-RPM Gyroscopic Flywheel, Centrifugal Pendulum Keel, and Red Bull Ground-Effect Aero Canards.
  - **Mascot Toppers (`topper`):** **Shadow** (Golden Retriever Co-Pilot 🦮, unlocked at 0 stars), **Boomer** (Blue Great Dane Mascot 🐶, unlocked at 0 stars), Raging Bull Horns, Dual Aerodynamic Red Bull Wings, Carbon Dolphin Aero Fin, Giant Pier Finish Bell, and Red Bull Stratos Supersonic Capsule.
- **Workshop Dyno — Balance & Cadence Dyno Rig (`TandemWorkshopHUD.tsx`):**
  - **Center-of-Gravity & Lateral Stability Analyzer:** Interactive dyno rolls the tandem laterally to reveal the exact **Rollover Threshold Angle (`28°` baseline)** and calculates total vehicle mass (`massKg`).
  - **Dual-Rider Cadence Dyno:** Spins drive rollers to measure Captain + Stoker synchronous wattage output (`cadencePowerW`) and verify sprint acceleration capability.
  - **Outrigger Stance Gauge:** Displays effective stabilization width (`outriggerWidthFt`) and roll damping index.
- **120Hz Over-Water Obstacle Track & Physics (`src/tandem/TandemPhysicsEngine.ts`):**
  - **7 Progressive Track Sectors (`0 – 200 ft`):**
    1. **Dock Launch (`0 – 15 ft`):** Rhythmic crowd hype and dock cadence release into open track.
    2. **Narrow Balance Beam (`15 – 70 ft`):** 3.0-ft wide wooden beam over water requiring micro-steering balance adjustments; lateral offset $|z| > 1.5\text{ ft}$ or roll angle exceeding critical limits plunges the crew into the canal.
    3. **Rhythm Rollers (`70 – 100 ft`):** Sinusoidal roller whoops testing pitch dampening and pedaling rhythm.
    4. **Tilting Seesaw Bridge (`100 – 140 ft`):** Dynamic teeter-totter bridge with a pivotal fulcrum at `120 ft`. Climbing uphill requires active cadence sprint power; passing the fulcrum dynamically pivots the bridge downward for descent.
    5. **Water Cannon Hazard Alley (`140 – 160 ft`):** High-pressure lateral water jets delivering sudden lateral impulse forces requiring prompt counter-steering and lean roll.
    6. **Ramp Gap Jump (`160 – 185 ft`):** Elevated ballistic launch ramp spanning a 25-ft open water chasm. Demands minimum entry sprint speed ($\ge 14\text{ MPH}$) and level touchdown attitude ($< 18^\circ$ roll).
    7. **Golden Finish Bell (`185 – 200 ft`):** Final pier platform with collision-triggered golden bell ringing celebration.
  - **3-Judge Animated Scorecard:**
    - **Creativity (0–10 Pts):** Evaluates part synergies, paint theme, and Mascot Toppers (Shadow 🦮 and Boomer 🐶 award maximum +35 pts bonus).
    - **Showmanship / Crew Sync (0–10 Pts):** Evaluates dock launch timing, rhythm continuity, and balance preservation.
    - **Distance & Finish Pace (0–10 Pts):** Evaluates course distance completed and sprint pace.
    - **Shared Star Progression:** $\ge 26\text{ pts} \rightarrow \text{3 Stars }⭐⭐⭐$, $\ge 20\text{ pts} \rightarrow \text{2 Stars }⭐⭐$, else $\text{1 Star }⭐$, credited immediately to `flugtag_stars_v1`.

---

## 🎮 Controls Across All 4 Environments

| Mode / Action | Touch (Razr Foldable / Tablet) | Chromebook / Keyboard |
| :--- | :--- | :--- |
| **Arcade Hub — Quick-Launch Game 1 / 2 / 3 / 4** | Tap Event Card | `1`, `2`, `3`, `4` |
| **Return to Arcade Hub from Workshop** | Tap **`◀ Arcade Hub`** | `Escape` |
| **Flugtag — Hype / Sprint Push / Drop Trolley** | Right Thumb Action Button | `Spacebar` |
| **Flugtag — Pitch Nose Up / Nose Down** | Left Thumb **`NOSE UP`** / **`NOSE DOWN`** | `ArrowUp`/`W` • `ArrowDown`/`S` |
| **Soap Box Derby — Steer Left / Right** | Left Thumb **`◀ LEFT`** / **`RIGHT ▶`** | `ArrowLeft`/`A` • `ArrowRight`/`D` |
| **Soap Box Derby — Pit Push / Drift Brake** | Right Thumb **`PUSH`** / **`BRAKE / DRIFT`** | `Spacebar` / `ArrowDown` / `S` |
| **Rollercoaster — Lean / Pitch Trim** | Left Thumb **`LEAN L`** / **`R`** | `ArrowLeft`/`A` • `ArrowRight`/`D` |
| **Rollercoaster — LIM Charge / Boost / Eddy Brake** | Right Thumb **`LIM BOOST`** / **`BRAKE`** | `Spacebar` / `ArrowUp` / `ArrowDown` |
| **Tandem — Steer Left / Right** | Left Thumb **`STEER L`** / **`STEER R`** | `ArrowLeft`/`A` • `ArrowRight`/`D` |
| **Tandem — Active Lean Roll Left / Right** | Left Thumb **`⯇ LEAN`** / **`LEAN ⯈`** | `Q` • `E` |
| **Tandem — Pedal Cadence / Dock Hype Launch** | Right Thumb **`🚴 PEDAL CADENCE`** | `ArrowUp`/`W` |
| **Tandem — Sprint Power Burst** | Right Thumb **`⚡ SPRINT`** | `Spacebar` / `Shift` |
| **Tandem — Coaster Brake** | Right Thumb **`🛑 BRAKE`** | `ArrowDown`/`S` |
| **Tandem — Quick Restart / Abort Run** | Tap HUD Buttons | `R` (Restart) • `Esc`/`B` (Workshop) |

---

## 🗂️ Project Architecture

```text
redbull-flugtag/
├── src/
│   ├── App.tsx                        # Top-level router (4 games), shared stars, records & hash navigation
│   ├── main.tsx                       # React entry point
│   ├── index.css                      # Tailwind CSS v4 + responsive HUD utilities
│   ├── audio/
│   │   └── SoundEngine.ts             # Web Audio API procedural sound effects (cadence, seesaw, bell, cheer)
│   ├── flugtag/                       # Game 1: Red Bull Flugtag
│   │   └── FlugtagGame.tsx            # Standalone Game 1 controller (Hangar + 30-ft Pier Flight)
│   ├── builder/
│   │   └── PartCatalog.ts             # Flugtag aircraft parts, stats, presets & dog toppers (Shadow & Boomer)
│   ├── physics/
│   │   ├── CraftMetrics.ts            # Static CG/AC balance, wing loading & L/D calculations
│   │   └── AeroPhysicsEngine.ts       # 120Hz aerodynamic flight physics, thermals, gusts & judging
│   ├── scene/
│   │   ├── Craft3DBuilder.ts          # Procedural Three.js 3D aircraft meshes, gizmos & flight crew
│   │   └── FlugtagCanvas3D.tsx        # Three.js Hangar & Miami Bay 3D environments, wind tunnel & splashdown
│   ├── soapbox/
│   │   ├── SoapboxPartCatalog.ts      # 6 automotive categories (chassis, steering, wheels, suspension, brakes, topper)
│   │   ├── SoapboxPhysicsEngine.ts    # 120Hz downhill gravity, tire grip/drift, brake fade, jumps & rollover physics
│   │   ├── Soapbox3DBuilder.ts        # Procedural 3D soapbox cars, steering linkage, suspension & Road Shaker rig
│   │   ├── SoapboxCanvas3D.tsx        # 3D Garage + 1,000-ft winding Alpine road, chicanes, slicks & finish arch
│   │   └── SoapboxGame.tsx            # Standalone Game 2 controller, Garage HUD, Race HUD & 3-Judge Scorecard
│   ├── coaster/
│   │   ├── CoasterPartCatalog.ts      # 6 coaster categories (car chassis, 3-wheel upstop bogies, restraints, nose, booster, topper)
│   │   ├── CoasterPhysicsEngine.ts    # 120Hz 3D spline track physics, 75-ft loop, helix, 32-ft rail gap jump & brake run
│   │   ├── Coaster3DBuilder.ts        # Procedural 3D coaster cars, upstop bogies, restraints & Track Dyno rig
│   │   ├── CoasterCanvas3D.tsx        # 3D Engineering Bay + 2,000-ft tubular steel coaster park & lagoon splashdown
│   │   └── CoasterGame.tsx            # Standalone Game 3 controller, Bay HUD, Ride HUD & 3-Judge Scorecard
│   ├── tandem/                        # Game 4: Red Bull Tandem Bike Challenge
│   │   ├── types.ts                   # Types, loadout contracts, telemetry, and obstacle interfaces
│   │   ├── TandemPartCatalog.ts       # 6 categories (38 parts), Shadow & Boomer mascots, presets & themes
│   │   ├── TandemPhysicsEngine.ts     # 120Hz fixed-timestep physics, seesaw bridge, water cannon & gap jump
│   │   ├── TandemBike3DBuilder.ts     # Procedural 3D tandem bike meshes, Captain & Stoker crew, and mascots
│   │   ├── TandemCanvas3D.tsx         # Three.js 3D workshop bay, dyno rig, canal water & obstacle scene
│   │   ├── TandemWorkshopHUD.tsx      # Workshop UI: 6 part categories, presets, paint themes, dyno toggle
│   │   ├── TandemCourseHUD.tsx        # In-run HUD: inclinometer bubble, beam lane meter, dual-thumb touch controls
│   │   ├── TandemScorecardModal.tsx   # 3-Judge scorecard (Creativity, Showmanship, Distance) & stars modal
│   │   └── TandemGame.tsx             # Standalone Game 4 state coordinator, sound triggers, and hub integration
│   └── ui/
│       ├── LandingPage.tsx            # Red Bull DIY Extreme Arcade Hub (4-game selector & records)
│       ├── HangarHUD.tsx              # Flugtag Hangar builder UI + My Craft Garage modal
│       ├── FlightHUD.tsx              # Flugtag 2-Thumb Flight HUD + Live Pitch Level Guide Gauge
│       └── JudgingScorecardModal.tsx  # Flugtag 3-Judge animated scorecard & star unlock modal
├── server.mjs                         # Production Node HTTP static/SPA server for Cloud Run
├── write-bundle.mjs                   # Generates .apphosting/bundle.yaml for Firebase App Hosting
├── apphosting.yaml                    # Firebase App Hosting Cloud Run resource config
├── firebase.json                      # Firebase CLI App Hosting backend configuration
└── .firebaserc                        # Default Firebase project binding (leprechaun-trap-eec0e)
```

---

## 🚀 Local Development & Deployment

### Run Locally
```bash
npm install
npm run dev
```
Then open `http://localhost:5173`.

### Build for Production
```bash
npm run build
npm start
```

### Deploy to Firebase App Hosting
```bash
npx -y firebase-tools@latest deploy --project leprechaun-trap-eec0e
```

