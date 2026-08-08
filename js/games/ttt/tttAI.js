/* ==========================================================================
   TTTAI.JS — Tic Tac Toe computer opponent
   ==========================================================================
   Pure function of board state: given the current 9-cell board and which
   symbol the AI plays, returns the index it wants to play. No DOM, no
   network — ttt.js calls this directly when the active mode is 'computer'.
   ========================================================================== */

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function winnerOf(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(v => v)) return 'draw';
  return null;
}

function emptyIndices(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (!board[i]) out.push(i);
  return out;
}

// Perfect-play minimax — small search space (max 9! states), instant even
// unminified. aiSymbol is who we're optimizing for.
function minimax(board, symbol, aiSymbol) {
  const winner = winnerOf(board);
  if (winner === aiSymbol) return { score: 10 };
  if (winner && winner !== 'draw') return { score: -10 };
  if (winner === 'draw') return { score: 0 };

  const nextSymbol = symbol === 'X' ? 'O' : 'X';
  const moves = [];
  for (const i of emptyIndices(board)) {
    board[i] = symbol;
    const result = minimax(board, nextSymbol, aiSymbol);
    board[i] = null;
    moves.push({ idx: i, score: result.score });
  }

  const maximizing = symbol === aiSymbol;
  let best = moves[0];
  for (const m of moves) {
    if (maximizing ? m.score > best.score : m.score < best.score) best = m;
  }
  return best;
}

function bestMove(board, aiSymbol) {
  return minimax(board.slice(), aiSymbol, aiSymbol).idx;
}

function randomMove(board) {
  const options = emptyIndices(board);
  return options[Math.floor(Math.random() * options.length)];
}

// Easy: mostly random, but still blocks an immediate loss and takes an
// immediate win when handed one — otherwise it feels less like "playing"
// and more like the AI isn't paying attention at all.
function easyMove(board, aiSymbol) {
  const oppSymbol = aiSymbol === 'X' ? 'O' : 'X';
  for (const i of emptyIndices(board)) {
    const copy = board.slice(); copy[i] = aiSymbol;
    if (winnerOf(copy) === aiSymbol) return i; // take the win
  }
  for (const i of emptyIndices(board)) {
    const copy = board.slice(); copy[i] = oppSymbol;
    if (winnerOf(copy) === oppSymbol) return i; // block the loss
  }
  // 70% of the time just play randomly to stay beatable
  if (Math.random() < 0.7) return randomMove(board);
  return bestMove(board, aiSymbol);
}

export const TttAI = {
  // difficulty: 'easy' | 'hard'
  getMove(board, aiSymbol, difficulty) {
    if (difficulty === 'hard') return bestMove(board, aiSymbol);
    return easyMove(board, aiSymbol);
  },
};
