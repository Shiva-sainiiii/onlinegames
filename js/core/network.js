/* ==========================================================================
   NETWORK.JS — WebRTC peer connection via PeerJS + a tiny message bus
   ==========================================================================
   This module owns the actual PeerJS Peer/DataConnection objects and room
   code generation. It knows NOTHING about game rules — it just moves JSON
   messages between the two browsers and lets other modules subscribe to
   message types via Net.onMessage(type, handler).

   Room code format: 5 random chars + 1 trailing "game id" char, e.g. "X7K2MT".
   The trailing char lets a joining player's client know which game module
   to load before the connection is even established.
   ========================================================================== */

import { UI } from './ui.js';

export const Net = (() => {
  "use strict";

  let peer = null;
  let conn = null;
  let isHost = false;
  let roomCode = '';

  const messageHandlers = {}; // type -> [handlers]
  const lifecycleHandlers = { open: [], close: [], error: [] };

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function peerIdFromCode(code) {
    return 'arcade-' + code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function on(type, handler) {
    (messageHandlers[type] = messageHandlers[type] || []).push(handler);
  }

  function onOpen(handler) { lifecycleHandlers.open.push(handler); }
  function onClose(handler) { lifecycleHandlers.close.push(handler); }

  function dispatch(msg) {
    const list = messageHandlers[msg.type];
    if (list) list.forEach(h => h(msg));
  }

  function send(obj) {
    if (conn && conn.open) conn.send(obj);
  }

  function attachConn(c) {
    conn = c;
    conn.on('data', dispatch);
    conn.on('close', () => lifecycleHandlers.close.forEach(h => h()));
    conn.on('error', (e) => console.error('[net] connection error', e));
  }

  /**
   * Host a room. gameIdChar is a single uppercase letter identifying the
   * game (e.g. 'T' for tic-tac-toe, 'C' for chess) — embedded as the last
   * character of the shareable room code.
   */
  function host(gameIdChar) {
    isHost = true;
    roomCode = randomCode() + gameIdChar;

    peer = new window.Peer(peerIdFromCode(roomCode), { config: { iceServers: ICE_SERVERS } });

    peer.on('open', () => {});

    peer.on('connection', (c) => {
      attachConn(c);
      conn.on('open', () => {
        lifecycleHandlers.open.forEach(h => h());
      });
    });

    peer.on('error', (err) => {
      console.error('[net] host error', err);
      if (err.type === 'unavailable-id') {
        // Extremely rare collision — retry with a fresh code.
        peer.destroy();
        host(gameIdChar);
      } else {
        UI.toast('Connection error. Try again.');
        lifecycleHandlers.error.forEach(h => h(err));
      }
    });

    return roomCode;
  }

  /**
   * Join a room by code. Returns the decoded trailing game-id char so the
   * caller can load the right game module before the connection completes.
   */
  function join(rawCode, { onConnected, onFailed } = {}) {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) { UI.toast('Enter a room code'); return null; }

    isHost = false;
    roomCode = code;
    const gameIdChar = code.slice(-1);

    peer = new window.Peer({ config: { iceServers: ICE_SERVERS } });

    peer.on('open', () => {
      const c = peer.connect(peerIdFromCode(code), { reliable: true });
      attachConn(c);
      conn.on('open', () => {
        lifecycleHandlers.open.forEach(h => h());
        if (onConnected) onConnected();
      });
      setTimeout(() => {
        if (!conn.open) {
          UI.toast("Couldn't find that room. Check the code.");
          if (onFailed) onFailed();
          peer.destroy();
        }
      }, 9000);
    });

    peer.on('error', (err) => {
      console.error('[net] join error', err);
      UI.toast("Couldn't find that room. Check the code.");
      if (onFailed) onFailed();
    });

    return gameIdChar;
  }

  function teardown() {
    if (conn) { try { conn.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    peer = null;
    conn = null;
  }

  function getIsHost() { return isHost; }
  function getRoomCode() { return roomCode; }
  function isConnected() { return !!(conn && conn.open); }
  function getPeer() { return peer; }
  function getRemotePeerId() { return conn ? conn.peer : null; }

  return {
    on, onOpen, onClose, send,
    host, join, teardown,
    getIsHost, getRoomCode, isConnected,
    getPeer, getRemotePeerId,
  };
})();
