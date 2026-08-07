/* ==========================================================================
   CHAT.JS — in-game chat panel (text + emoji reactions)
   Added: typing notifications, improved bubbles with timestamps, top chat button wiring
   ========================================================================== */

import { Net } from './network.js';
import { Audio } from './audio.js';

export const Chat = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let chatOpen = false;
  let unreadCount = 0;

  let chatToggle, chatToggleTop, chatPanel, chatMessages, chatBadge, chatBadgeTop, chatInput, chatSendBtn, chatScrim;
  let typingDebounce = null;

  function setOpen(open) {
    chatOpen = open;
    if (chatToggle) chatToggle.classList.toggle('open', open);
    chatPanel.classList.toggle('open', open);
    chatScrim.classList.toggle('show', open);
    if (open) {
      unreadCount = 0;
      updateBadge();
      requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
    }
  }

  function updateBadge() {
    const text = unreadCount > 9 ? '9+' : String(unreadCount);
    if (chatBadge) { chatBadge.textContent = text; chatBadge.classList.toggle('show', unreadCount > 0); }
    if (chatBadgeTop) { chatBadgeTop.textContent = text; chatBadgeTop.style.display = unreadCount > 0 ? 'inline-block' : 'none'; }
  }

  function formatTime(ts = Date.now()) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addBubble({ text, who = 'them', kind = 'text', ts = Date.now() }) {
    const emptyEl = chatMessages.querySelector('.chat-empty');
    if (emptyEl) emptyEl.remove();
    const row = document.createElement('div');
    row.className = 'chat-row ' + (who === 'me' ? 'me' : 'them');

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble' + (kind === 'emoji' ? ' reaction' : '');
    bubble.textContent = text;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    meta.textContent = formatTime(ts);

    if (who === 'me') {
      row.appendChild(meta);
      row.appendChild(bubble);
    } else {
      row.appendChild(bubble);
      row.appendChild(meta);
    }

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (who === 'them') {
      Audio.play('message');
      if (!chatOpen) {
        unreadCount++;
        updateBadge();
      }
    }
  }

  function showRemoteTyping(val) {
    let el = chatMessages.querySelector('.typing-indicator');
    if (val) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = '<div class="dots"><span></span><span></span><span></span></div><div class="who">Friend is typing…</div>';
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      if (el) el.remove();
    }
  }

  function sendChat(text, kind) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    addBubble({ text: trimmed, who: 'me', kind });
    Net.send({ type: 'chat', text: trimmed, kind: kind || 'text', ts: Date.now() });
  }

  function reset() {
    chatMessages.innerHTML = '<div class="chat-empty">Say hi 👋</div>';
    unreadCount = 0;
    updateBadge();
    setOpen(false);
  }

  function init() {
    chatToggle = $('chatToggle');
    chatToggleTop = $('chatToggleTop');
    chatPanel = $('chatPanel');
    chatMessages = $('chatMessages');
    chatBadge = $('chatBadge');
    chatBadgeTop = $('chatBadgeTop');
    chatInput = $('chatInput');
    chatSendBtn = $('chatSendBtn');
    chatScrim = $('chatScrim');

    // wire toggles
    if (chatToggle) chatToggle.addEventListener('click', () => setOpen(!chatOpen));
    if (chatToggleTop) chatToggleTop.addEventListener('click', () => setOpen(!chatOpen));
    if (chatScrim) chatScrim.addEventListener('click', () => setOpen(false));

    // send actions
    chatSendBtn.addEventListener('click', () => { sendChat(chatInput.value, 'text'); chatInput.value = ''; sendTyping(false); });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { sendChat(chatInput.value, 'text'); chatInput.value = ''; sendTyping(false); }
      else { sendTyping(true); }
    });
    chatInput.addEventListener('blur', () => sendTyping(false));

    // quick reactions
    document.querySelectorAll('.chat-quick-row button').forEach(btn => {
      btn.addEventListener('click', () => { sendChat(btn.dataset.emoji, 'emoji'); });
    });

    // typing events (debounced)
    function sendTyping(isTyping) {
      Net.send({ type: 'typing', isTyping: !!isTyping });
      if (typingDebounce) clearTimeout(typingDebounce);
      if (isTyping) typingDebounce = setTimeout(() => { Net.send({ type: 'typing', isTyping: false }); typingDebounce = null; }, 3000);
    }

    // network handlers
    Net.on('chat', (msg) => addBubble({ text: msg.text, who: 'them', kind: msg.kind || 'text', ts: msg.ts || Date.now() }));
    Net.on('typing', (msg) => showRemoteTyping(!!msg.isTyping));
  }

  return { init, reset, sendChat };
})();
