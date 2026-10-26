# 🐂✈️🏎️🎢 Red Bull DIY Extreme Arcade 3D — 3-Game Engineering Sandbox

A 3-in-1 3D engineering builder and physics simulation arcade inspired by **Red Bull Flugtag**, **Red Bull Soap Box Derby**, and **Red Bull Extreme Rollercoaster**. Built with React 19, Three.js, and Tailwind CSS v4 with responsive 2-thumb controls across phones (including the **Motorola Razr Foldable**), tablets, and Chromebooks.

- **🌐 Live Game (Firebase App Hosting):** [https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app](https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app)
- **📦 GitHub Repository:** [https://github.com/will814/redbull-flugtag](https://github.com/will814/redbull-flugtag)

---

## 🏟️ 3-Game Standalone Architecture

Each competition is architected as a completely isolated, purpose-built 3D engineering sandbox with its own workshop builder, interactive physics dyno rig, 6 specialized vehicle component sockets, custom launch platform, and 3-Judge scorecard, unified by a shared star-unlock progression economy.

### 0. Landing Page Arcade Hub (`src/ui/LandingPage.tsx`)
- **Interactive 3-Event Selector:** Displays live personal-best records (`FT`, race times, thrill scores), shared Judge Stars (`⭐`), and engineering specs for each competition:
  - **Launch Platform & Lab Dyno**
  - **6 Vehicle Component Slots**
  - **Signature Course Obstacles & Physics**
- **Instant Keyboard & Hash Navigation:** Press `1`, `2`, or `3` on the Landing Page to jump directly into **Flugtag**, **Soap Box Derby**, or **Extreme Rollercoaster** (or navigate via `#flugtag`, `#soapbox`, `#coaster`). Press `Esc` inside any workshop or click **`◀ Arcade Hub`** to return to the hub at any time.

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

## 🎮 Controls Across All 3 Environments

| Mode / Action | Touch (Razr Foldable / Tablet) | Chromebook / Keyboard |
| :--- | :--- | :--- |
| **Arcade Hub — Quick-Launch Game 1 / 2 / 3** | Tap Event Card | `1`, `2`, `3` |
| **Return to Arcade Hub from Workshop** | Tap **`◀ Arcade Hub`** | `Escape` |
| **Flugtag — Hype / Sprint Push / Drop Trolley** | Right Thumb Action Button | `Spacebar` |
| **Flugtag — Pitch Nose Up / Nose Down** | Left Thumb **`NOSE UP`** / **`NOSE DOWN`** | `ArrowUp`/`W` • `ArrowDown`/`S` |
| **Soap Box Derby — Steer Left / Right** | Left Thumb **`◀ LEFT`** / **`RIGHT ▶`** | `ArrowLeft`/`A` • `ArrowRight`/`D` |
| **Soap Box Derby — Pit Push / Drift Brake** | Right Thumb **`PUSH`** / **`BRAKE / DRIFT`** | `Spacebar` / `ArrowDown` / `S` |
| **Rollercoaster — Lean / Pitch Trim** | Left Thumb **`LEAN L`** / **`R`** | `ArrowLeft`/`A` • `ArrowRight`/`D` |
| **Rollercoaster — LIM Charge / Boost / Eddy Brake** | Right Thumb **`LIM BOOST`** / **`BRAKE`** | `Spacebar` / `ArrowUp` / `ArrowDown` |

---

## 🗂️ Project Architecture

```text
redbull-flugtag/
├── src/
│   ├── App.tsx                        # Top-level router, shared stars, records & legacy localStorage migration
│   ├── main.tsx                       # React entry point
│   ├── index.css                      # Tailwind CSS v4 + responsive HUD utilities
│   ├── audio/
│   │   └── SoundEngine.ts             # Zero-dependency Web Audio API procedural sound effects
│   ├── flugtag/
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
│   └── ui/
│       ├── LandingPage.tsx            # Red Bull DIY Extreme Arcade Hub (3-game selector & records)
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

