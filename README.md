# Arcade — folder structure

```
index.html              Shell only: all screen markup + <link>/<script> includes
css/
  theme.css              Design tokens, layout, lobby, hosting screen, player
                          badges, chat, toasts — everything NOT board-specific
  ttt.css                 Tic Tac Toe board styles only
  chess.css                Chessboard styles only
  <yourgame>.css            Add one per new game
js/
  main.js                App entry point. Wires lobby -> network -> chat -> game.
                          Keep this file thin — it should orchestrate, not
                          contain game rules or low-level networking.
  core/
    network.js            Owns the PeerJS Peer/DataConnection + room codes.
                           Exposes Net.send()/Net.on(type, handler) as a tiny
                           message bus. Knows nothing about game rules.
    ui.js                  Screen switching, status pill, toast helper.
    chat.js                In-game chat panel (text + emoji reactions).
    audio.js               Sound effects manager — see below.
    gameRegistry.js         The plugin interface every game module implements.
                           Read the big comment at the top of this file before
                           adding a new game.
  games/
    ttt/ttt.js              Tic Tac Toe rules + rendering
    chess/chess.js           Chess rules + rendering (uses chess.js library)
    <yourgame>/<yourgame>.js  Add one per new game
assets/
  sfx/                     Drop real sound files here (see audio.js)
```

## Adding a new game

1. `js/games/<name>/<name>.js` — implement the shape documented at the top
   of `js/core/gameRegistry.js` (init, enter, reset, applyRemoteMove,
   onSymbolSwap, isRoundOver, setResultHandler) and call
   `GameRegistry.registerGame({...})` at the bottom.
2. `css/<name>.css` — board-specific styles. Link it from `index.html`.
3. In `index.html`, add a board container element inside `#game` (hidden by
   default — `main.js` shows/hides based on which game is active).
4. In `js/main.js`, add one line: `import './games/<name>/<name>.js';`
5. Done — it automatically appears as a tile in the game picker, and the
   room-code system, chat, rematch, and disconnect handling all work for it
   with zero extra wiring, as long as your module implements the interface.

The trailing letter of the room code identifies the game to the joining
player (e.g. `X7K2MT` = Tic Tac Toe, `X7K2MC` = Chess). Give your game a
free uppercase letter in `main.js`'s `createRoom()`.

## Adding sound effects

`js/core/audio.js` already works with zero asset files — it synthesizes
simple tones via WebAudio as a fallback for every event (move, capture,
check, win, lose, draw, click, connect, message, error).

To use real audio instead:
1. Drop a file in `assets/sfx/`, e.g. `assets/sfx/win.mp3`
2. Uncomment/add the matching line in `SFX_FILES` in `audio.js`:
   `win: 'assets/sfx/win.mp3'`
3. That's it — `Audio.play('win')` will now play the file instead of the
   synthesized tone automatically.

Call `Audio.play('eventName')` from any game module to trigger a sound.

## Adding opponent modes (computer / local pass-and-play)

Each game's `supportsMode` object in its registration (see `ttt.js` /
`chess.js`) declares which modes it currently supports. Right now only
`friendOnline` is implemented end-to-end. To add a computer opponent:

1. Write the AI logic inside the game module (e.g. `chess.js`) behind a
   `mode` flag, OR create a shared `js/core/ai/` helper if the logic is
   reusable across games.
2. Set `supportsMode.computer = true` once it works.
3. Add mode-picker UI (a new screen between the game picker and lobby) that
   lets the player choose "Play a friend online" vs "Play the computer" —
   `main.js` already has a `selectedMode` variable reserved for this.

## Networking model

WebRTC peer-to-peer via PeerJS. PeerJS's free public broker is used only
for the initial handshake (finding the other browser) — actual game moves,
chat, and rematch messages travel directly between the two browsers over
the WebRTC data channel afterward. No backend server, no database, nothing
is stored.
