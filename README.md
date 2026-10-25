# 🐂✈️ Red Bull Flugtag 3D — Craft Builder & Flight Simulator

A 3D craft-building and aerodynamic flight game inspired by the real-world **Red Bull Flugtag** competition, designed to combine authentic glider physics with kid-friendly visual feedback and 2-thumb controls across phones (including the **Motorola Razr Foldable**), tablets, and Chromebooks.

- **🌐 Live Game (Firebase App Hosting):** [https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app](https://redbull-flugtag--leprechaun-trap-eec0e.us-east4.hosted.app)
- **📦 GitHub Repository:** [https://github.com/will814/redbull-flugtag](https://github.com/will814/redbull-flugtag)

---

## ✨ Key Features

### 1. 3D Hangar & Modular Snap-Socket Builder
- **6 Modular Part Categories + Paint Themes:**
  - **Wings (`wings`):** Classic Balsa Glider Wings, Super-Wide Albatross Wings, Giant Cardboard Box Wings, Giant Pepperoni Pizza Wings, Midnight Bat Wings, Twin-Deck Biplane Wings, and Carbon Fiber Record Breakers.
  - **Toppers (`topper`):** **Shadow** (Golden Retriever 🦮), **Boomer** (Black & White Great Dane 🐶), Lucky Rooster Mascot 🐓, El Grande Giant Taco 🌮, Living Room Party Couch 🛋️, Inflatable T-Rex Rider 🦖, Giant Sparkle Disco Ball 🪩, and King of the Pier Crown 👑.
  - **Hulls (`chassis`):** Balsa Box Fuselage, Triple Pool Noodle Raft, Giant Hot Dog Cart, Clawfoot Porcelain Bathtub, and Carbon Teardrop Pod.
  - **Noses (`nose`):** Foam Nose Cone, Giant Quack Beak, Sizzling Kettle BBQ Grill (Nose Weight), Windmill Spin-Prop, and Fire Dragon Snout.
  - **Tails (`tail`):** Aero Tail & Rudder, Twin V-Tail Feathers, Heavy Cardboard Boosters, and Rainbow Party Streamer Tail.
  - **Launch Trolleys (`trolley`):** Speedy Skateboard Dolly, Supermarket Shopping Cart, and Pro Carbon Launch Rail.
- **Kid-Friendly Physics Feedback:**
  - **Seesaw Balance Indicator (`CG` vs. `AC`):** Immediately shows whether the craft is a **Balanced Glider!**, **Nose Heavy (Dives!)**, or **Tail Heavy (Flips!)**.
  - **400 lb Official Flugtag Weight Limit:** Tracks total ramp weight (`craft + trolley + 105 lb pilot`) against the competition's 400 lb limit.
  - **Interactive Wind Tunnel (`TEST FAN`):** Spins up a giant 3D hangar fan with airflow ribbons to preview how the craft pitches and lifts before rolling out to the pier.
- **My Craft Garage (`💾 Save` & `📂 Builds`):**
  - Save unlimited custom craft configurations to `localStorage` with custom names or auto-generated fun names, preview part icons and weights, or load famous presets (**🌮 Flying Taco Supreme**, **🦖 Dino Bathtub Express**, **👑 Pro Record Glider**).

### 2. Real-World Aerodynamics & 3-Phase Flight Simulation
- **Phase 1 — 30-Foot Deck Skit (`HYPE DANCE!`):** Tap the right action button or `Spacebar` to pump up the 4-person flight crew and crowd hype for the Showmanship judges.
- **Phase 2 — 90-Foot Ramp Push & Wheel Drop (`PUSH!!` $\rightarrow$ `DROP WHEELS!`):**
  - Active tapping accelerates the crew sprint down the 30-foot-high pier.
  - Tap **`DROP WHEELS!`** inside the glowing green zone at the lip of the ramp (`-22 ft` to `0 ft`) to shed the heavy trolley and pop cleanly into the air.
- **Phase 3 — Airborne Glide & Live Pitch Level Guide:**
  - **Live Vertical Pitch Level Guide Gauge:** Positioned right next to the left-thumb **`NOSE UP`** / **`NOSE DOWN`** buttons with a tilting `✈️` indicator and degree readout:
    - **Green Sweet Spot (`-5.5°` to `+12.5°`):** Grants laminar glide lift bonus for maximum distance.
    - **Pitch Too High (`> +12.5°`, Red `HIGH ⚠️`):** Triggers aerodynamic stall drag that bleeds forward airspeed and sinks altitude.
    - **Pitch Too Low (`< -5.5°`, Amber `LOW ⚠️`):** Causes a steep nose-dive altitude penalty toward the water.
  - **Thermal Updraft Rings & Bay Wind Gusts:** Fly through golden thermal rings (`⭕`) for speed/updraft boosts and counter mid-bay **Sea Breeze Gusts** and **Bay Downdrafts** on the way to the **258 ft World Record**.
- **Phase 4 — Buoyant Water Splashdown & 3-Judge Scorecard:**
  - World-aligned floating debris, 3D water droplet bursts, and expanding foam ripple rings on splashdown.
  - Scored out of **30 Points** (10 pts each for **Creativity**, **Showmanship**, and **Distance**) to earn **1 to 3 Stars (`⭐`)** and unlock new parts.

---

## 🎮 Controls

| Action | Touch (Razr Foldable / Tablet) | Chromebook / Keyboard |
| :--- | :--- | :--- |
| **Crew Hype / Ramp Sprint Push / Drop Trolley / Airhorn** | Right Thumb Big Action Button | `Spacebar` |
| **Pitch Nose Up (Shift Pilot Weight Back)** | Left Thumb **`↑ NOSE UP`** | `ArrowUp` or `W` |
| **Pitch Nose Down (Shift Pilot Weight Forward)** | Left Thumb **`↓ NOSE DOWN`** | `ArrowDown` or `S` |
| **Orbit 3D Craft in Hangar** | Drag on 3D Craft | Click & Drag |

---

## 🗂️ Project Architecture

```text
redbull-flugtag/
├── src/
│   ├── App.tsx                        # Top-level game state, saved builds & star persistence
│   ├── main.tsx                       # React entry point
│   ├── index.css                      # Tailwind CSS v4 + custom HUD animations
│   ├── audio/
│   │   └── SoundEngine.ts             # Zero-dependency Web Audio API procedural sound effects
│   ├── builder/
│   │   └── PartCatalog.ts             # All modular parts, stats, presets & dog toppers (Shadow & Boomer)
│   ├── physics/
│   │   ├── CraftMetrics.ts            # Static CG/AC balance, wing loading & L/D calculations
│   │   └── AeroPhysicsEngine.ts       # 60Hz flight physics, pitch zone penalties, wind gusts & judging
│   ├── scene/
│   │   ├── Craft3DBuilder.ts          # Procedural Three.js 3D meshes for all parts, mascots & crew
│   │   └── FlugtagCanvas3D.tsx        # Three.js Hangar & Miami Bay 3D environments, camera & debris
│   └── ui/
│       ├── HangarHUD.tsx              # Responsive Hangar builder UI + My Craft Garage modal
│       ├── FlightHUD.tsx              # 2-Thumb Flight HUD + Live Pitch Level Guide Gauge
│       └── JudgingScorecardModal.tsx  # 3-Judge animated scorecard & star unlock modal
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
