/* ==========================================================================
   CHAT.JS — in-game chat panel (text + emoji reactions + voice-line soundboard)
   Talks to the peer purely through Net; knows nothing about which game
   is active, so it works unchanged for every game module.
   ========================================================================== */

import { Net } from './network.js';
import { Audio } from './audio.js';

export const Chat = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- Soundboard / "audio dialogue" presets ----
  // Both players already ship with the same files in assets/sfx/voicelines/,
  // so we only ever send the preset's *id* over the data channel — each side
  // plays its own local copy, no audio bytes cross the wire.
  const VOICE_LINES = [
    { id: 'gg',       label: '🤝 GG',        file: 'assets/sfx/voicelines/gg.mp3' },
    { id: 'nice',     label: '🔥 Nice one',  file: 'assets/sfx/voicelines/nice.mp3' },
    { id: 'unlucky',  label: '😭 Unlucky',   file: 'assets/sfx/voicelines/unlucky.mp3' },
    { id: 'again',    label: '😤 Run it back', file: 'assets/sfx/voicelines/again.mp3' },
    { id: 'laugh',    label: '😂 Laugh',     file: 'assets/sfx/voicelines/laugh.mp3' },
    { id: 'wow',      label: '😱 Wow',       file: 'assets/sfx/voicelines/wow.mp3' },
  ];
  const voiceLineCache = {};

  function playVoiceLine(id) {
    const line = VOICE_LINES.find(v => v.id === id);
    if (!line) return;
    let el = voiceLineCache[id];
    if (!el) { el = new window.Audio(line.file); el.volume = 0.85; voiceLineCache[id] = el; }
    el.currentTime = 0;
    el.play().catch(() => {});
  }

  let chatOpen = false;
  let unreadCount = 0;
  let activeTab = 'emoji'; // 'emoji' | 'lines'

  let chatToggle, chatPanel, chatMessages, chatBadge, chatInput, chatSendBtn, chatScrim;
  let chatQuickRow, tabEmojiBtn, tabLinesBtn;

  function setOpen(open) {
    chatOpen = open;
    chatToggle.classList.toggle('open', open);
    chatPanel.classList.toggle('open', open);
    chatScrim.classList.toggle('show', open);
    if (open) {
      unreadCount = 0;
      updateBadge();
      requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
    }
  }

  function updateBadge() {
    chatBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    chatBadge.classList.toggle('show', unreadCount > 0);
  }

  function addBubble(text, who, kind) {
    const emptyEl = chatMessages.querySelector('.chat-empty');
    if (emptyEl) emptyEl.remove();
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + who + (kind === 'emoji' || kind === 'voiceline' ? ' reaction' : '');
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (who === 'them') {
      Audio.play('message');
      if (!chatOpen) {
        unreadCount++;
        updateBadge();
      }
    }
  }

  function sendChat(text, kind) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    addBubble(trimmed, 'me', kind);
    Net.send({ type: 'chat', text: trimmed, kind: kind || 'text' });
  }

  function sendVoiceLine(id) {
    const line = VOICE_LINES.find(v => v.id === id);
    if (!line) return;
    playVoiceLine(id);
    addBubble(line.label, 'me', 'voiceline');
    Net.send({ type: 'chat', text: line.label, kind: 'voiceline', voiceLineId: id });
  }

  function renderQuickRow() {
    chatQuickRow.innerHTML = '';
    tabEmojiBtn.classList.toggle('tab-active', activeTab === 'emoji');
    tabLinesBtn.classList.toggle('tab-active', activeTab === 'lines');

    if (activeTab === 'emoji') {
      ['👍', '😂', '🔥', '😱', '🤝'].forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.addEventListener('click', () => sendChat(emoji, 'emoji'));
        chatQuickRow.appendChild(btn);
      });
    } else {
      VOICE_LINES.forEach(line => {
        const btn = document.createElement('button');
        btn.className = 'voiceline-btn';
        btn.textContent = line.label;
        btn.addEventListener('click', () => sendVoiceLine(line.id));
        chatQuickRow.appendChild(btn);
      });
    }
  }

  function reset() {
    chatMessages.innerHTML = '<div class="chat-empty">Say hi 👋</div>';
    unreadCount = 0;
    updateBadge();
    setOpen(false);
  }

  function init() {
    chatToggle = $('chatToggle');
    chatPanel = $('chatPanel');
    chatMessages = $('chatMessages');
    chatBadge = $('chatBadge');
    chatInput = $('chatInput');
    chatSendBtn = $('chatSendBtn');
    chatScrim = $('chatScrim');
    chatQuickRow = $('chatQuickRow');
    tabEmojiBtn = $('tabEmojiBtn');
    tabLinesBtn = $('tabLinesBtn');

    chatToggle.addEventListener('click', () => setOpen(!chatOpen));
    chatScrim.addEventListener('click', () => setOpen(false));

    chatSendBtn.addEventListener('click', () => {
      sendChat(chatInput.value, 'text');
      chatInput.value = '';
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChat(chatInput.value, 'text');
        chatInput.value = '';
      }
    });

    tabEmojiBtn.addEventListener('click', () => { activeTab = 'emoji'; renderQuickRow(); });
    tabLinesBtn.addEventListener('click', () => { activeTab = 'lines'; renderQuickRow(); });
    renderQuickRow();

    Net.on('chat', (msg) => {
      addBubble(msg.text, 'them', msg.kind);
      if (msg.kind === 'voiceline' && msg.voiceLineId) playVoiceLine(msg.voiceLineId);
    });
  }

  return { init, reset, sendChat };
})();
