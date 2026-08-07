/* ==========================================================================
   VOICE.JS — optional mic voice chat over the same PeerJS connection
   ==========================================================================
   Reuses the existing Net.getPeer() (already connected for the data
   channel) to place/accept a PeerJS media call carrying a mic-only
   MediaStream. Nothing here touches game logic — it only knows about
   mic-on/off and speaker-on/off state, mirrored to the other player so
   both can see "Friend is talking" / "Friend muted" in the UI.
   ========================================================================== */

import { Net } from './network.js';
import { UI } from './ui.js';

export const Voice = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let localStream = null;
  let mediaCall = null;
  let remoteAudioEl = null;
  let micOn = false;      // am I broadcasting my mic
  let speakerOn = true;   // am I playing the friend's audio
  let callActive = false;

  let micBtn, speakerBtn, voiceRow;

  function setUI() {
    if (!micBtn) return;
    micBtn.classList.toggle('active', micOn);
    micBtn.textContent = micOn ? '🎙️' : '🎙️';
    micBtn.title = micOn ? 'Mute mic' : 'Unmute mic';
    micBtn.classList.toggle('muted-icon', !micOn);

    speakerBtn.classList.toggle('active', speakerOn);
    speakerBtn.textContent = speakerOn ? '🔊' : '🔈';
    speakerBtn.title = speakerOn ? 'Mute friend' : 'Unmute friend';
    speakerBtn.classList.toggle('muted-icon', !speakerOn);

    voiceRow.hidden = !Net.isConnected();
  }

  async function getMic() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return localStream;
  }

  function attachRemoteStream(stream) {
    if (!remoteAudioEl) {
      remoteAudioEl = new window.Audio();
      remoteAudioEl.autoplay = true;
      document.body.appendChild(remoteAudioEl);
    }
    remoteAudioEl.srcObject = stream;
    remoteAudioEl.muted = !speakerOn;
    remoteAudioEl.play().catch(() => {
      // Autoplay can be blocked until a gesture; the mic/speaker button
      // tap that got us here counts as one, so this is mostly a no-op safety net.
    });
  }

  // The caller places the call as soon as *either* side turns their mic on,
  // so voice works even if only one player wants to talk.
  async function ensureCallPlaced() {
    if (mediaCall || !Net.isConnected()) return;
    const peer = Net.getPeer();
    const remoteId = Net.getRemotePeerId();
    if (!peer || !remoteId) return;

    try {
      const stream = await getMic();
      mediaCall = peer.call(remoteId, stream);
      wireCall(mediaCall);
    } catch (err) {
      console.error('[voice] mic access failed', err);
      UI.toast("Couldn't access mic");
      micOn = false;
      setUI();
    }
  }

  function wireCall(call) {
    call.on('stream', (remoteStream) => {
      callActive = true;
      attachRemoteStream(remoteStream);
    });
    call.on('close', () => {
      callActive = false;
      if (remoteAudioEl) remoteAudioEl.srcObject = null;
    });
    call.on('error', (e) => console.error('[voice] call error', e));
  }

  // Answer an incoming call from the other player (fires even if we
  // ourselves haven't tapped mic-on — we can still listen).
  function listenForIncomingCalls() {
    const peer = Net.getPeer();
    if (!peer) return;
    peer.on('call', async (call) => {
      mediaCall = call;
      try {
        // Answer with our mic if it's already on, otherwise answer silently
        // (empty audio track) so we can still receive their audio.
        const stream = micOn ? await getMic() : new MediaStream();
        call.answer(stream);
        wireCall(call);
      } catch (err) {
        call.answer(new MediaStream());
        wireCall(call);
      }
    });
  }

  async function setMicOn(on) {
    micOn = on;
    if (on) {
      await ensureCallPlaced();
      if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = true);
    } else if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = false);
    }
    setUI();
  }

  function setSpeakerOn(on) {
    speakerOn = on;
    if (remoteAudioEl) remoteAudioEl.muted = !on;
    setUI();
  }

  function teardown() {
    if (mediaCall) { try { mediaCall.close(); } catch (e) {} mediaCall = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (remoteAudioEl) { remoteAudioEl.srcObject = null; }
    micOn = false;
    callActive = false;
    setUI();
  }

  function init() {
    voiceRow = $('voiceRow');
    micBtn = $('micToggleBtn');
    speakerBtn = $('speakerToggleBtn');

    micBtn.addEventListener('click', () => setMicOn(!micOn));
    speakerBtn.addEventListener('click', () => setSpeakerOn(!speakerOn));

    Net.onOpen(() => {
      listenForIncomingCalls();
      setUI();
    });
    Net.onClose(() => teardown());

    setUI();
  }

  return { init, teardown };
})();
