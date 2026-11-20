# Sheru Bhai: The King of Kochi — Web Game

A browser-first, local-first playable slice built with Three.js from the supplied Kochi map and the story document in `docs/story-master.md`. The project is in this folder and needs no dedicated game launcher.

## Run in a browser

```powershell
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://127.0.0.1:5173`). Keep Ollama running with `qwen3:0.6b` installed for locally generated NPC conversation. Use **Story Mode** for the opening cutscene and the first playable juice-shop mission, or **Open World** for free roaming, local NPCs, vehicle driving, and sandbox cash.

Controls: **WASD** move/drive, **Shift** run, drag the mouse on the game view to look around, **T** talk to a nearby character, **E** use the highlighted mission station, **F** enter or exit the sedan, and **Esc** pause/close a conversation.

## Local speech

- **Speech input:** Shruti Malayalam + English runs in the browser through ONNX. Press the microphone button in a conversation. On first use the browser downloads the small model; after that it is cached locally. Only the transcript text is sent to the local Ollama endpoint. The model is intended to handle Malayalam, English, and code-switched Malayalam-English.
- **Speech output:** the optional Indic Tiny Malayalam and Indic Tiny English models run through the local Python TTS service. To install them once, run `npm run voice:models`, then restart Vite. Click **VOICE OFF** to enable playback. Malayalam TTS requires Malayalam script; it will not speak romanized Manglish reliably. The authored story dialogue stays in the source document's Manglish spelling, ready for your own recorded character voices.
- No speech API keys or cloud services are used by the game. First model downloads require an internet connection.

## What's playable in this slice

- Supplied 81 MB map as the 3D world, with its Z-up geometry converted for Three.js.
- Third-person movement, a lightweight local character crowd, a CC0 Kenney sedan, and the ability to drive it.
- Story Mode opening cutscene and mission 1, **Juice Master**, using dialogue from the supplied story. The juice stall, fruit, cutting station, blender, and sign are procedural placeholder geometry.
- Open World sandbox mode with ₹1,000,000, T-key NPC dialogue backed by the already installed `qwen3:0.6b`, and local save data.
- Save data stays in browser local storage. This first slice does not implement the remaining 31 missions, combat, traffic, or the full final city simulation yet.

## Files and asset credits

- `public/maps/map_game_ready.glb` is the map you supplied.
- `public/assets/characters/` uses the supplied Quaternius character GLBs. Their included license notice states CC0 1.0.
- `public/assets/cars/` uses the supplied Kenney sedan, taxi, and hatchback. Kenney's included notice states CC0.
- `public/assets/licenses/manifest.json` records the asset origins and licenses. The user-supplied Porsche model marked `unknown - user supplied` was not copied into this game.
- `models/` is reserved for optional speech weights. Indic Tiny TTS weights use CC-BY-4.0; retain the model and Rasa dataset credits from their model cards if distributing them.

The game source is original project code. The map and character story are user-provided. This project uses no GTA game files or Rockstar characters.
