/* ==========================================================================
   TTT.JS — Tic Tac Toe game module
   Implements the GameRegistry plugin interface. See gameRegistry.js for
   the contract every game module follows.
   ========================================================================== */

import { GameRegistry } from '../../core/gameRegistry.js';
import { Net } from '../../core/network.js';
import { Audio } from '../../core/audio.js';

const $ = (id) => document.getElementById(id);
const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

let board = Array(9).fill(null);
let turn = 'X';
let mySymbol = 'X';
let over = false;

let onResultCallback = null; // set by main.js via setResultHandler

function buildDom() {
  const boardEl = $('board');
  boardEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = i;
    cell.addEventListener('click', () => onCellClick(i));
    boardEl.appendChild(cell);
  }
}

function markSvg(symbol) {
  if (symbol === 'X') {
    return `<svg class="mark-x" viewBox="0 0 100 100">
      <path d="M20,20 L80,80" style="animation-delay:0s"/>
      <path d="M80,20 L20,80" style="animation-delay:0.12s"/>
    </svg>`;
  }
  return `<svg class="mark-o" viewBox="0 0 100 100"><circle cx="50" cy="50" r="32"/></svg>`;
}

function render(winLine) {
  const cells = $('board').children;
  for (let i = 0; i < 9; i++) {
    const cell = cells[i];
    const v = board[i];
    cell.classList.toggle('filled', !!v);
    cell.classList.toggle('win-cell', !!(winLine && winLine.includes(i)));
    cell.innerHTML = v ? markSvg(v) : '';
  }
  $('board').classList.toggle('disabled', over || turn !== mySymbol);
}

function updateTurnBanner() {
  const banner = $('turnBanner');
  if (over) return;
  banner.classList.remove('check');
  if (turn === mySymbol) banner.innerHTML = `<strong class="${mySymbol.toLowerCase()}">Your turn</strong>`;
  else banner.innerHTML = `Waiting for friend's move…`;
}

function updateActiveBadges(turnSymbol) {
  $('badgeX').classList.toggle('active', turnSymbol === 'X' && !over);
  $('badgeO').classList.toggle('active', turnSymbol === 'O' && !over);
}

function checkWinner() {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { symbol: board[a], line };
  }
  if (board.every(v => v)) return { symbol: 'draw', line: null };
  return null;
}

function onCellClick(i) {
  if (over || board[i] || turn !== mySymbol) return;
  applyMove(i, mySymbol);
  Net.send({ type: 'move', idx: i, symbol: mySymbol });
}

function applyMove(i, symbol) {
  board[i] = symbol;
  Audio.play('move');
  const result = checkWinner();
  if (result) {
    finish(result);
  } else {
    turn = symbol === 'X' ? 'O' : 'X';
    render();
    updateTurnBanner();
    updateActiveBadges(turn);
  }
}

function finish(result) {
  over = true;
  render(result.line);
  updateActiveBadges(null);
  if (onResultCallback) onResultCallback(result, { title: 'Tic Tac Toe' });
}

// ---- Registered interface ----
const tttGame = {
  id: 'ttt',
  label: 'Tic Tac Toe',
  icon: '⌗',
  subLabel: 'Quick & simple',
  boardElementId: 'board',
  supportsMode: { friendOnline: true, computer: false, localPass: false },

  init() {
    buildDom();
  },

  enter(symbol) {
    mySymbol = symbol;
    $('markX').textContent = 'X';
    $('markO').textContent = 'O';
    $('roleX').textContent = 'Player 1';
    $('roleO').textContent = 'Player 2';
  },

  reset() {
    board = Array(9).fill(null);
    turn = 'X';
    over = false;
    render();
    updateTurnBanner();
    updateActiveBadges(turn);
  },

  applyRemoteMove(payload) {
    applyMove(payload.idx, payload.symbol);
  },

  onSymbolSwap(newSymbol) {
    mySymbol = newSymbol;
  },

  isRoundOver() {
    return over || !board.some(v => v);
  },

  setResultHandler(fn) {
    onResultCallback = fn;
  },
};

GameRegistry.registerGame(tttGame);
export default tttGame;
