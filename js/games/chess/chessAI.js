/* ==========================================================================
   CHESSAI.JS — Chess computer opponent
   ==========================================================================
   Minimax with alpha-beta pruning over a chess.js instance. Depth-limited
   (2 for easy, 3 for hard) to keep think-time reasonable on a phone — this
   is a "plays sensible, thinks a few moves ahead" opponent, not an engine
   that will find deep tactics or mate in 6. No DOM, no network; chess.js
   (the game module) calls getMove() and applies whatever it returns.
   ========================================================================== */

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Small positional bonus tables (white's perspective; flipped for black)
// so the AI prefers center control and developed pieces over shuffling
// its back rank — without these it plays technically-legal but aimless chess.
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0,
];
const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];
const TABLES = { p: PAWN_TABLE, n: KNIGHT_TABLE, b: BISHOP_TABLE };

function squareIndex(square) {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0
  const rank = 8 - parseInt(square[1], 10);
  return rank * 8 + file;
}

function evaluateBoard(game) {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const idx = r * 8 + f;
      let value = PIECE_VALUE[piece.type];
      const table = TABLES[piece.type];
      if (table) value += piece.color === 'w' ? table[idx] : table[63 - idx];
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score; // positive favors White
}

function orderMoves(moves) {
  // Cheap move-ordering: check captures first so alpha-beta prunes harder.
  return moves.slice().sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));
}

function minimax(game, depth, alpha, beta, maximizing) {
  if (depth === 0 || game.isGameOver()) {
    return { score: evaluateBoard(game) };
  }

  const moves = orderMoves(game.moves({ verbose: true }));
  let best = null;

  for (const move of moves) {
    game.move(move);
    const result = minimax(game, depth - 1, alpha, beta, !maximizing);
    game.undo();

    if (best === null || (maximizing ? result.score > best.score : result.score < best.score)) {
      best = { score: result.score, move };
    }
    if (maximizing) alpha = Math.max(alpha, best.score);
    else beta = Math.min(beta, best.score);
    if (beta <= alpha) break; // prune
  }

  return best || { score: evaluateBoard(game) };
}

export const ChessAI = {
  // Returns { from, to, promotion } for the given chess.js game instance,
  // playing as `color` ('w' | 'b'). difficulty: 'easy' | 'hard'.
  getMove(game, color, difficulty) {
    const depth = difficulty === 'hard' ? 3 : 2;
    const maximizing = color === 'w';
    const result = minimax(game, depth, -Infinity, Infinity, maximizing);
    if (!result || !result.move) return null;
    const m = result.move;
    return { from: m.from, to: m.to, promotion: m.promotion };
  },
};
