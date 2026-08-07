/* ==========================================================================
   CHESS.JS — Chess game module (rules via chess.js library, loaded globally
   as window.Chess by index.html)
   Implements the GameRegistry plugin interface. See gameRegistry.js for
   the contract every game module follows.
   ========================================================================== */

import { GameRegistry } from '../../core/gameRegistry.js';
import { Net } from '../../core/network.js';
import { Audio } from '../../core/audio.js';

const $ = (id) => document.getElementById(id);
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECE_GLYPH = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };

let chessGame = null;
let mySymbol = 'X';
let selected = null;
let legalTargets = [];
let inputLocked = false;
let lastMoveSquares = [];
let over = false;

let onResultCallback = null;

function squareId(fileIdx, rankIdx) { return FILES[fileIdx] + (8 - rankIdx); }
function myColor() { return mySymbol === 'X' ? 'w' : 'b'; }

function buildDom() {
  const boardEl = $('chessBoard');
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = document.createElement('div');
      const id = squareId(f, r);
      sq.className = 'sq ' + (((r + f) % 2 === 0) ? 'light' : 'dark');
      sq.dataset.sq = id;
      if (f === 0) {
        const coord = document.createElement('span');
        coord.className = 'coord';
        coord.textContent = id;
        sq.appendChild(coord);
      }
      sq.addEventListener('click', () => onSquareClick(id));
      boardEl.appendChild(sq);
    }
  }
}

function pieceHtml(piece) {
  if (!piece) return '';
  return `<span class="piece">${PIECE_GLYPH[piece.type]}</span>`;
}

function render() {
  if (!chessGame) return;
  const boardEl = $('chessBoard');
  boardEl.classList.toggle('flipped', mySymbol === 'O');

  const boardState = chessGame.board();
  let checkSquare = null;
  if (chessGame.inCheck && chessGame.inCheck()) {
    const turnColor = chessGame.turn();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = boardState[r][f];
        if (p && p.type === 'k' && p.color === turnColor) checkSquare = squareId(f, r);
      }
    }
  }

  Array.from(boardEl.children).forEach(sqEl => {
    const id = sqEl.dataset.sq;
    const fileIdx = FILES.indexOf(id[0]);
    const rankIdx = 8 - parseInt(id[1], 10);
    const piece = boardState[rankIdx][fileIdx];

    const coordEl = sqEl.querySelector('.coord');
    sqEl.innerHTML = '';
    if (coordEl) sqEl.appendChild(coordEl);

    sqEl.classList.remove('white-piece', 'black-piece');
    if (piece) {
      sqEl.insertAdjacentHTML('beforeend', pieceHtml(piece));
      sqEl.classList.add(piece.color === 'w' ? 'white-piece' : 'black-piece');
    }

    sqEl.classList.toggle('selected', id === selected);
    sqEl.classList.toggle('last-move', lastMoveSquares.includes(id));
    sqEl.classList.toggle('in-check', id === checkSquare);

    const legal = legalTargets.find(m => m.to === id);
    if (legal) {
      const dot = document.createElement('div');
      dot.className = legal.captured ? 'capture-ring' : 'move-dot';
      sqEl.appendChild(dot);
    }
  });

  updateCapturedRow();
}

function updateCapturedRow() {
  const history = chessGame.history({ verbose: true });
  const byWhite = [], byBlack = [];
  history.forEach(m => {
    if (m.captured) {
      const glyph = PIECE_GLYPH[m.captured];
      (m.color === 'w' ? byWhite : byBlack).push(glyph);
    }
  });
  const mine = mySymbol === 'X' ? byWhite : byBlack;
  const theirs = mySymbol === 'X' ? byBlack : byWhite;
  $('capturedTop').textContent = theirs.join(' ') || '\u00A0';
  $('capturedBottom').textContent = mine.join(' ') || '\u00A0';
}

function updateTurnBanner() {
  const banner = $('turnBanner');
  if (over) return;
  banner.classList.remove('check');
  const turnColor = chessGame.turn();
  const myTurn = turnColor === myColor();
  const inCheck = chessGame.inCheck && chessGame.inCheck();
  if (inCheck) banner.classList.add('check');
  if (myTurn) banner.innerHTML = `<strong class="${mySymbol.toLowerCase()}">Your move${inCheck ? ' — Check!' : ''}</strong>`;
  else banner.innerHTML = `Waiting for friend's move…`;
}

function updateActiveBadges(turnSymbol) {
  $('badgeX').classList.toggle('active', turnSymbol === 'X' && !over);
  $('badgeO').classList.toggle('active', turnSymbol === 'O' && !over);
}

function resultIfOver() {
  if (!chessGame.isGameOver()) return null;
  if (chessGame.isCheckmate()) {
    const winnerColor = chessGame.turn() === 'w' ? 'b' : 'w';
    return { symbol: winnerColor === 'w' ? 'X' : 'O', reason: 'Checkmate' };
  }
  if (chessGame.isStalemate()) return { symbol: 'draw', reason: 'Stalemate' };
  if (chessGame.isThreefoldRepetition()) return { symbol: 'draw', reason: 'Threefold repetition' };
  if (chessGame.isInsufficientMaterial()) return { symbol: 'draw', reason: 'Insufficient material' };
  if (chessGame.isDraw()) return { symbol: 'draw', reason: '50-move rule' };
  return { symbol: 'draw', reason: 'Game over' };
}

function onSquareClick(id) {
  if (over || inputLocked) return;
  if (chessGame.turn() !== myColor()) return;

  if (selected) {
    const legal = legalTargets.find(m => m.to === id);
    if (legal) { playMove(selected, id, legal); return; }
  }

  const piece = chessGame.get(id);
  if (piece && piece.color === myColor()) {
    selected = id;
    legalTargets = chessGame.moves({ square: id, verbose: true });
  } else {
    selected = null;
    legalTargets = [];
  }
  render();
}

function playMove(from, to, legalMoveObj) {
  const needsPromotion = legalMoveObj && legalMoveObj.piece === 'p' && (to[1] === '8' || to[1] === '1');
  if (needsPromotion) {
    showPromoPicker((promo) => {
      commitMove(from, to, promo);
      Net.send({ type: 'move', from, to, promotion: promo });
    });
  } else {
    commitMove(from, to, undefined);
    Net.send({ type: 'move', from, to, promotion: undefined });
  }
}

function commitMove(from, to, promotion) {
  const wasCapture = !!chessGame.get(to);
  const move = chessGame.move({ from, to, promotion: promotion || 'q' });
  if (!move) return; // illegal / desync guard

  Audio.play(wasCapture ? 'capture' : 'move');
  if (chessGame.inCheck && chessGame.inCheck()) Audio.play('check');

  lastMoveSquares = [from, to];
  selected = null;
  legalTargets = [];
  const result = resultIfOver();
  if (result) {
    finish(result);
  } else {
    render();
    updateTurnBanner();
    updateActiveBadges(chessGame.turn() === 'w' ? 'X' : 'O');
  }
}

function finish(result) {
  over = true;
  render();
  updateActiveBadges(null);
  if (onResultCallback) onResultCallback(result, { title: 'Chess', reason: result.reason });
}

function showPromoPicker(onPick) {
  const overlay = $('promoOverlay');
  const opts = $('promoOptions');
  opts.innerHTML = '';
  const color = myColor();
  const pieces = [
    { type: 'q', glyph: PIECE_GLYPH.q },
    { type: 'r', glyph: PIECE_GLYPH.r },
    { type: 'b', glyph: PIECE_GLYPH.b },
    { type: 'n', glyph: PIECE_GLYPH.n },
  ];
  pieces.forEach(p => {
    const btn = document.createElement('div');
    btn.className = 'promo-btn ' + (color === 'w' ? 'white-piece' : 'black-piece');
    btn.innerHTML = `<span class="piece">${p.glyph}</span>`;
    btn.addEventListener('click', () => {
      overlay.classList.remove('show');
      onPick(p.type);
    });
    opts.appendChild(btn);
  });
  overlay.classList.add('show');
}

// ---- Registered interface ----
const chessGameDef = {
  id: 'chess',
  label: 'Chess',
  icon: '♞',
  subLabel: 'Full rules',
  boardElementId: 'chessBoard',
  wrapperElementId: 'chessWrap',
  supportsMode: { friendOnline: true, computer: false, localPass: false },

  init() {
    buildDom();
  },

  enter(symbol) {
    mySymbol = symbol;
    $('markX').textContent = '♔';
    $('markO').textContent = '♚';
    $('roleX').textContent = 'White';
    $('roleO').textContent = 'Black';
  },

  reset() {
    chessGame = new window.Chess();
    selected = null;
    legalTargets = [];
    inputLocked = false;
    lastMoveSquares = [];
    over = false;
    render();
    updateTurnBanner();
    updateActiveBadges('X');
  },

  applyRemoteMove(payload) {
    commitMove(payload.from, payload.to, payload.promotion);
  },

  onSymbolSwap(newSymbol) {
    mySymbol = newSymbol;
  },

  lockInput(locked) {
    inputLocked = locked;
  },

  isRoundOver() {
    return over || (chessGame && chessGame.history().length === 0);
  },

  setResultHandler(fn) {
    onResultCallback = fn;
  },
};

GameRegistry.registerGame(chessGameDef);
export default chessGameDef;
