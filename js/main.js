/* ==========================================================================
   MAIN.JS — app entry point
   ==========================================================================
   Wires together: game picker -> mode picker -> lobby -> connection -> game.
   This file owns the cross-cutting "which game/mode is active" state and
   delegates all actual gameplay to whichever module is registered in
   GameRegistry. It should stay thin — game rules belong in js/games/*,
   networking belongs in core/network.js, etc.
   ========================================================================== */

import { UI } from './core/ui.js';
import { Net } from './core/network.js';
import { Chat } from './core/chat.js';
import { Audio } from './core/audio.js';
import { Voice } from './core/voice.js';
import { GameRegistry } from './core/gameRegistry.js';

// Import + self-register every available game here. Adding a new game is
// just: write the module, add one import line below, add its picker tile
// in index.html.
import './games/ttt/ttt.js';
import './games/chess/chess.js';

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let selectedGameId = 'ttt';
  let selectedMode = 'friendOnline'; // 'friendOnline' | 'computer' | 'localPass'
  let selectedDifficulty = 'easy';
  let activeGame = null;             // the GameRegistry entry currently in play
  let mySymbol = null;               // 'X' (host) or 'O' (guest)
  let rematchSwapped = false;
  let roomCodeVal = '';

  const MODE_INFO = {
    friendOnline: { icon: '🌐', label: 'Play Online', sub: 'Invite a friend with a room code' },
    computer:     { icon: '🤖', label: 'Play vs Computer', sub: 'Practice against an AI opponent' },
    localPass:    { icon: '📱', label: 'Play with a Friend', sub: 'Pass the phone, same device' },
  };

  // ---------------------------------------------------------------
  // Game picker screen
  // ---------------------------------------------------------------
  function renderGamePicker() {
    const grid = $('pickerGrid');
    grid.innerHTML = '';
    GameRegistry.listGames().forEach(g => {
      const tile = document.createElement('div');
      tile.className = 'game-tile' + (g.id === selectedGameId ? ' selected' : '');
      tile.dataset.game = g.id;
      // Square thumbnail at assets/thumb-<id>.png. If it hasn't been
      // uploaded yet (or fails to load for any reason), fall back to the
      // emoji icon so the tile never shows a broken-image glyph.
      tile.innerHTML = `
        <div class="thumb">
          <img src="assets/thumb-${g.id}.png" alt="${g.label}"
               onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'thumb-fallback', textContent:'${g.icon}'}))" />
        </div>
        <div class="label">${g.label}</div>
        <div class="sub">${g.subLabel}</div>
      `;
      tile.addEventListener('click', () => {
        selectedGameId = g.id;
        renderGamePicker();
      });
      grid.appendChild(tile);
    });
  }

  $('pickerNextBtn').addEventListener('click', () => {
    renderModePicker();
    UI.showScreen('modePicker');
  });

  $('backToPickerBtn').addEventListener('click', () => {
    renderModePicker();
    UI.showScreen('modePicker');
  });

  // ---------------------------------------------------------------
  // Mode picker: Online / Computer / Local pass-and-play
  // ---------------------------------------------------------------
  function renderModePicker() {
    const game = GameRegistry.getGame(selectedGameId);
    const list = $('modeList');
    list.innerHTML = '';
    Object.keys(MODE_INFO).forEach(modeId => {
      if (!game.supportsMode[modeId]) return; // game hasn't implemented this mode
      const info = MODE_INFO[modeId];
      const card = document.createElement('button');
      card.className = 'mode-tile';
      card.innerHTML = `
        <div class="icon">${info.icon}</div>
        <div>
          <div class="label">${info.label}</div>
          <div class="sub">${info.sub}</div>
        </div>
      `;
      card.addEventListener('click', () => selectMode(modeId));
      list.appendChild(card);
    });
  }

  function selectMode(modeId) {
    selectedMode = modeId;
    if (modeId === 'friendOnline') {
      UI.showScreen('lobby');
    } else if (modeId === 'computer') {
      UI.showScreen('difficultyPicker');
    } else if (modeId === 'localPass') {
      startLocalGame();
    }
  }

  $('backToGamePickerBtn').addEventListener('click', () => {
    UI.showScreen('picker');
  });

  // ---------------------------------------------------------------
  // Difficulty picker (computer mode)
  // ---------------------------------------------------------------
  document.querySelectorAll('.mode-tile[data-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDifficulty = btn.dataset.difficulty;
      startComputerGame();
    });
  });

  $('backToModePickerBtn').addEventListener('click', () => {
    UI.showScreen('modePicker');
  });

  // ---------------------------------------------------------------
  // Local (offline) game starters — no Net involvement at all
  // ---------------------------------------------------------------
  function startComputerGame() {
    activeGame = GameRegistry.getGame(selectedGameId);
    const aiSymbol = 'O'; // human always plays first / X / White
    mySymbol = 'X';
    if (activeGame.setMode) {
      activeGame.setMode({ mode: 'computer', difficulty: selectedDifficulty, aiSymbol });
    }
    enterLocalGame();
  }

  function startLocalGame() {
    activeGame = GameRegistry.getGame(selectedGameId);
    mySymbol = 'X';
    if (activeGame.setMode) {
      activeGame.setMode({ mode: 'localPass' });
    }
    enterLocalGame();
  }

  function enterLocalGame() {
    UI.setStatus('', selectedMode === 'computer' ? 'vs Computer' : 'Local');
    setupGameChrome();
    UI.showScreen('game');
    Chat.reset();
    activeGame.reset();
    Audio.play('connect');
    Audio.playBgMusic();
  }

  // ---------------------------------------------------------------
  // Lobby: host / join
  // ---------------------------------------------------------------
  function setupGameChrome() {
    activeGame = GameRegistry.getGame(selectedGameId);
    if (selectedMode === 'friendOnline' && activeGame.setMode) {
      activeGame.setMode({ mode: 'friendOnline' });
    }
    GameRegistry.listGames().forEach(g => {
      // A game can optionally declare a wrapperElementId (e.g. chess's board
      // sits inside #chessWrap alongside other chess-only UI). Falls back to
      // the board element itself when no separate wrapper is needed.
      const wrap = $(g.wrapperElementId || g.boardElementId);
      if (wrap) wrap.hidden = (g.id !== selectedGameId);
    });
    // capturedRow is chess-specific UI (captured piece tray) — fine to special-case
    // since not every game needs it. A future game with similar needs can either
    // reuse this element or add its own.
    $('capturedRow').hidden = (selectedGameId !== 'chess');
    $('hudActions').hidden = (selectedMode !== 'friendOnline');
    activeGame.enter(mySymbol);
    syncNameLabels();
  }

  // Keeps "You" attached to whichever badge (X or O) the local player
  // currently controls — needed because rematch can swap colors. For
  // computer mode we label the AI explicitly; for local pass-play we
  // just show Player 1 / Player 2 since both sides are the same person's
  // device.
  function syncNameLabels() {
    if (selectedMode === 'localPass') {
      $('nameX').textContent = 'Player 1';
      $('nameO').textContent = 'Player 2';
      return;
    }
    if (selectedMode === 'computer') {
      const aiIsX = mySymbol === 'O';
      $('nameX').textContent = aiIsX ? 'Computer' : 'You';
      $('nameO').textContent = aiIsX ? 'You' : 'Computer';
      return;
    }
    if (mySymbol === 'X') {
      $('nameX').textContent = 'You';
      if ($('nameO').textContent === 'You') $('nameO').textContent = 'Friend';
    } else {
      $('nameO').textContent = 'You';
      if ($('nameX').textContent === 'You') $('nameX').textContent = 'Friend';
    }
  }

  function createRoom() {
    selectedMode = 'friendOnline';
    const gameIdChar = selectedGameId === 'chess' ? 'C' : 'T';
    mySymbol = 'X';
    UI.showScreen('hosting');
    UI.setStatus('waiting', 'Waiting…');

    roomCodeVal = Net.host(gameIdChar, {});
    $('roomCode').textContent = roomCodeVal;
  }

  function joinRoom(code) {
    selectedMode = 'friendOnline';
    mySymbol = 'O';
    UI.setStatus('waiting', 'Connecting…');
    $('joinBtn').disabled = true;

    const gameIdChar = Net.join(code, {
      onFailed: () => {
        UI.setStatus('', 'Offline');
        $('joinBtn').disabled = false;
      },
    });

    if (gameIdChar) selectedGameId = (gameIdChar === 'C') ? 'chess' : 'ttt';
  }

  // Fires once the WebRTC data channel is actually open, for BOTH host and
  // guest — this is the single source of truth for "connection established,
  // go start the game."
  Net.onOpen(() => {
    Net.send({ type: 'name', name: 'Player' });
    enterGame();
  });

  Net.onClose(() => {
    $('disconnectBanner').classList.add('show');
    if (activeGame && activeGame.lockInput) activeGame.lockInput(true);
    else if (activeGame) $(activeGame.boardElementId).classList.add('disabled');
    UI.setStatus('', 'Disconnected');
    Audio.stopBgMusic();
  });

  function enterGame() {
    UI.setStatus('connected', 'Connected');
    setupGameChrome();
    UI.showScreen('game');
    Chat.reset();
    activeGame.reset();
    Audio.play('connect');
    Audio.playBgMusic();
  }

  function leaveGame() {
    Net.teardown();
    rematchSwapped = false;
    $('joinBtn').disabled = false;
    UI.setStatus('', 'Offline');
    Chat.reset();
    UI.showScreen('picker');
    Audio.stopBgMusic();
  }

  $('hostBtn').addEventListener('click', createRoom);
  $('joinBtn').addEventListener('click', () => joinRoom($('joinInput').value));
  $('joinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('joinInput').value); });
  $('joinInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

  $('cancelHostBtn').addEventListener('click', () => {
    Net.teardown();
    UI.setStatus('', 'Offline');
    UI.showScreen('lobby');
  });

  $('copyCodeBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(roomCodeVal); UI.toast('Code copied!'); }
    catch { UI.toast(roomCodeVal); }
  });

  $('shareBtn').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?room=${roomCodeVal}`;
    const gameName = GameRegistry.getGame(selectedGameId).label;
    const text = `Play ${gameName} with me! Join with code ${roomCodeVal} or open: ${url}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch {} }
    else {
      try { await navigator.clipboard.writeText(text); UI.toast('Link copied!'); }
      catch { UI.toast(url); }
    }
  });

  $('leaveBtn').addEventListener('click', leaveGame);

  $('rematchBtn').addEventListener('click', () => {
    if (!activeGame.isRoundOver()) return; // ignore mid-game taps
    if (selectedMode !== 'friendOnline') {
      // Computer / local pass-play: no network round-trip needed, just
      // restart directly. Keep the same symbols/side each time — a "swap"
      // only makes sense when negotiating with a remote peer.
      activeGame.reset();
    } else if (Net.getIsHost()) {
      triggerRematchAsHost();
    } else {
      Net.send({ type: 'rematch-request' });
    }
  });

  function triggerRematchAsHost() {
    const swap = !rematchSwapped;
    rematchSwapped = swap;
    doRematch(swap);
    Net.send({ type: 'rematch-accept', swap });
  }

  function doRematch(swap) {
    if (swap) {
      mySymbol = mySymbol === 'X' ? 'O' : 'X';
      if (activeGame.onSymbolSwap) activeGame.onSymbolSwap(mySymbol);
    }
    syncNameLabels();
    activeGame.reset();
  }

  // ---------------------------------------------------------------
  // Cross-game network message handling
  // ---------------------------------------------------------------
  Net.on('move', (msg) => {
    if (activeGame) activeGame.applyRemoteMove(msg);
  });

  // Only the host decides the next color-swap, so both sides never pick
  // independently and desync who's playing which color.
  Net.on('rematch-request', () => {
    if (Net.getIsHost()) triggerRematchAsHost();
  });

  Net.on('rematch-accept', (msg) => {
    rematchSwapped = msg.swap;
    doRematch(msg.swap);
  });

  Net.on('name', (msg) => {
    (mySymbol === 'X' ? $('nameO') : $('nameX')).textContent = msg.name || 'Friend';
  });

  // ---------------------------------------------------------------
  // Result banner (shared across games) — each game module calls this
  // via setResultHandler so win/lose/draw text rendering stays in one place.
  // ---------------------------------------------------------------
  function handleGameResult(result) {
    const banner = $('resultBanner');
    $('turnBanner').textContent = '';
    banner.classList.add('show');
    if (result.symbol === 'draw') {
      banner.className = 'result-banner show draw';
      banner.textContent = result.reason || "It's a draw!";
      Audio.play('draw');
    } else if (result.symbol === mySymbol) {
      banner.className = 'result-banner show win';
      banner.textContent = (result.reason ? result.reason + ' — ' : '') + 'You won! 🎉';
      Audio.play('win');
    } else {
      banner.className = 'result-banner show lose';
      banner.textContent = (result.reason ? result.reason + ' — ' : '') + 'You lost this round.';
      Audio.play('lose');
    }
  }

  GameRegistry.listGames().forEach(g => {
    if (g.setResultHandler) g.setResultHandler(handleGameResult);
  });

  function clearResultBanner() {
    $('resultBanner').classList.remove('show');
    $('disconnectBanner').classList.remove('show');
  }
  // Hook into every reset so old result text doesn't linger. Simplest way
  // without changing each game module: wrap reset once here.
  GameRegistry.listGames().forEach(g => {
    const originalReset = g.reset.bind(g);
    g.reset = function (...args) {
      clearResultBanner();
      return originalReset(...args);
    };
  });

  // ---------------------------------------------------------------
  // Sound toggle
  // ---------------------------------------------------------------
  const soundBtn = $('soundToggle');
  function refreshSoundBtn() {
    const muted = Audio.isMuted();
    soundBtn.textContent = muted ? '🔇' : '🔊';
    soundBtn.classList.toggle('muted', muted);
  }
  soundBtn.addEventListener('click', () => {
    Audio.toggleMuted();
    refreshSoundBtn();
  });
  refreshSoundBtn();

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  GameRegistry.listGames().forEach(g => g.init());
  Chat.init();
  Voice.init();
  renderGamePicker();

  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    selectedMode = 'friendOnline';
    UI.showScreen('lobby');
    $('joinInput').value = roomParam.toUpperCase();
  }

  window.addEventListener('beforeunload', () => Net.teardown());

})();
