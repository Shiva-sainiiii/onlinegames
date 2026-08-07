/* ==========================================================================
   GAME-REGISTRY.JS — plugin system for games
   ==========================================================================
   Every game module (js/games/<name>/<name>.js) registers itself here with
   a small, consistent interface. main.js and network.js never need to know
   which specific game is active — they just call these lifecycle hooks.

   To add a NEW game in future:
     1. Create js/games/<yourgame>/<yourgame>.js
     2. Implement the shape described below and call registerGame(...)
     3. Import it once from main.js
     4. Add a tile for it in the #picker screen in index.html
   That's the whole integration surface.

   ---- Required shape of a registered game ----
   {
     id: 'ttt',                 // short id, also used as room-code suffix letter (uppercase)
     label: 'Tic Tac Toe',      // shown in the game picker
     icon: '⌗',                 // emoji/icon shown in the game picker
     subLabel: 'Quick & simple',
     boardElementId: 'board',   // the DOM element this game renders into (hidden/shown automatically)
     supportsMode: {            // which opponent modes this game currently supports
       friendOnline: true,
       computer: false,         // set true once an AI opponent is implemented for this game
       localPass: false,        // set true once same-device hotseat play is implemented
     },

     // Lifecycle -----------------------------------------------------
     // Called once when this game becomes the active game for a fresh
     // connection (host or guest). mySymbol is 'X' (host/White) or 'O'
     // (guest/Black, or player 2 in general).
     enter(mySymbol) {},

     // Called to start/restart a round. No args — a fresh state every time.
     reset() {},

     // Called whenever a 'move' message arrives from the peer. The shape
     // of the payload is entirely up to the game module (network.js just
     // forwards it verbatim).
     applyRemoteMove(payload) {},

     // Called after a rematch color-swap so the game can relabel its own
     // "which side am I" state. Optional — only needed if mySymbol affects
     // rendering (most games will implement this).
     onSymbolSwap(newMySymbol) {},

     // Should return true while a round is in progress (used to decide
     // whether the Rematch button is allowed to act immediately).
     isRoundOver() {},
   }
   ========================================================================== */

export const GameRegistry = (() => {
  "use strict";

  const games = {};
  const order = [];

  function registerGame(def) {
    games[def.id] = def;
    order.push(def.id);
  }

  function getGame(id) { return games[id]; }
  function listGames() { return order.map(id => games[id]); }

  return { registerGame, getGame, listGames };
})();
