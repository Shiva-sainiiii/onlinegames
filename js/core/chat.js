/* ==========================================================================
   CHAT.JS — in-game chat panel (text + emoji reactions)
   Talks to the peer purely through Net; knows nothing about which game
   is active, so it works unchanged for every game module.
   ========================================================================== */

import { Net } from './network.js';
import { Audio } from './audio.js';

export const Chat = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let chatOpen = false;
  let unreadCount = 0;

  let chatToggle, chatPanel, chatMessages, chatBadge, chatInput, chatSendBtn, chatScrim;

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
    bubble.className = 'chat-bubble ' + who + (kind === 'emoji' ? ' reaction' : '');
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

    document.querySelectorAll('.chat-quick-row button').forEach(btn => {
      btn.addEventListener('click', () => sendChat(btn.dataset.emoji, 'emoji'));
    });

    Net.on('chat', (msg) => addBubble(msg.text, 'them', msg.kind));
  }

  return { init, reset, sendChat };
})();
