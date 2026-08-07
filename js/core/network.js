/* ==========================================================================
   NETWORK.JS — WebRTC peer connection via PeerJS + a tiny message bus
   Added: media call support (callPeer, incoming call hooks)
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

  let currentCall = null;

  // Handlers that can be set by other modules (voice.js will set these)
  let incomingCallHandler = null; // callback(call)
  let callStreamHandler = null;   // callback(remoteStream)
  let callCloseHandler = null;    // callback()

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

  // --- Media call helpers -------------------------------------------------
  function attachCallHandlers(call, opts = {}) {
    currentCall = call;
    call.on('stream', (remoteStream) => {
      if (opts.onStream) opts.onStream(remoteStream);
      if (callStreamHandler) callStreamHandler(remoteStream);
    });
    call.on('close', () => {
      if (opts.onClose) opts.onClose();
      if (callCloseHandler) callCloseHandler();
      currentCall = null;
    });
    call.on('error', (e) => console.error('[net] call error', e));
  }

  function callPeerWithStream(stream, opts = {}) {
    if (!peer) throw new Error('Peer not initialized yet');
    const call = peer.call(peerIdFromCode(roomCode), stream);
    attachCallHandlers(call, opts);
    return call;
  }

  function setupPeerCallListener(p) {
    if (!p || !p.on) return;
    p.on('call', (call) => {
      if (incomingCallHandler) {
        try { incomingCallHandler(call); }
        catch (e) { console.error('[net] incomingCallHandler error', e); }
      } else {
        // Default answer without stream (receive-only) to avoid throwing
        try { call.answer(); } catch (e) { /* ignore */ }
        attachCallHandlers(call, {});
      }
    });
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

    setupPeerCallListener(peer);

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

    setupPeerCallListener(peer);

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
    if (currentCall && currentCall.close) { try { currentCall.close(); } catch (e) {} }
    peer = null;
    conn = null;
    currentCall = null;
  }

  function getIsHost() { return isHost; }
  function getRoomCode() { return roomCode; }
  function isConnected() { return !!(conn && conn.open); }

  const netExports = {
    on, onOpen, onClose, send,
    host, join, teardown,
    getIsHost, getRoomCode, isConnected,
    // media helpers
    callPeer: callPeerWithStream,
    // these properties are exposed as accessors below so other modules can
    // assign handlers like Net._onIncomingCall = fn
    _onIncomingCall: null,
    _onCallStream: null,
    _onCallClose: null,
  };

  // Keep internal handler refs in sync with external property assignments
  Object.defineProperty(netExports, '_onIncomingCall', {
    get() { return incomingCallHandler; },
    set(v) { incomingCallHandler = v; }
  });
  Object.defineProperty(netExports, '_onCallStream', {
    get() { return callStreamHandler; },
    set(v) { callStreamHandler = v; }
  });
  Object.defineProperty(netExports, '_onCallClose', {
    get() { return callCloseHandler; },
    set(v) { callCloseHandler = v; }
  });

  return netExports;
})();
