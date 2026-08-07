/* ==========================================================================
   VOICE.JS — simple peer-to-peer voice manager
   - Uses getUserMedia to obtain a local audio stream
   - Integrates with Net by expecting Net.callPeer and Net._onIncomingCall hooks
   - Provides: init(net), start(), stop(), mute(), unmute(), isMuted(), on('stream', fn)
   ========================================================================== */

export const Voice = (() => {
  let localStream = null;
  let activeCall = null;
  let muted = false;
  let net = null;
  const listeners = { stream: [] };

  function emit(name, v) { (listeners[name] || []).forEach(fn => fn(v)); }

  async function getLocalStream(constraints = { audio: true }) {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return localStream;
  }

  function attachCall(call) {
    activeCall = call;
    call.on('stream', (remote) => {
      emit('stream', remote);
    });
    call.on('close', () => {
      activeCall = null;
      emit('stream', null);
    });
    call.on('error', (e) => console.error('[voice] call error', e));
  }

  function init(netModule) {
    net = netModule;
    if (!net) return;

    // Default incoming-call handler delegates to Net._onIncomingCall if present
    net._onIncomingCall = (call) => {
      // Try to answer with local stream (preferred). If that fails, answer without stream.
      getLocalStream().then(s => {
        try {
          call.answer(s);
        } catch (e) {
          try { call.answer(); } catch (err) { console.warn('[voice] answer fallback failed', err); }
        }
        attachCall(call);
      }).catch(() => {
        try { call.answer(); } catch (err) { console.warn('[voice] answer failed', err); }
        attachCall(call);
      });
    };

    // Hook Net internals so remote streams are forwarded if network exposes them
    net._onCallStream = (remote) => emit('stream', remote);
    net._onCallClose = () => emit('stream', null);
  }

  async function start() {
    if (!net) throw new Error('Voice: Net not initialized');
    if (activeCall) return;
    const stream = await getLocalStream();
    if (net.callPeer) {
      const call = net.callPeer(stream, {
        onStream(remote) { emit('stream', remote); },
        onClose() { emit('stream', null); }
      });
      attachCall(call);
    } else {
      console.warn('[voice] Net.callPeer not available');
    }
  }

  function stop() {
    if (activeCall && activeCall.close) activeCall.close();
    activeCall = null;
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    emit('stream', null);
  }

  function mute() {
    muted = true;
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
  }
  function unmute() {
    muted = false;
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = true);
  }
  function isMuted() { return muted; }

  function pauseSending() {
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
  }
  function resumeSending() {
    if (localStream && !muted) localStream.getAudioTracks().forEach(t => t.enabled = true);
  }

  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }

  return { init, start, stop, mute, unmute, isMuted, pauseSending, resumeSending, on };
})();
