/* ==========================================================================
   UI.JS — screen navigation, status pill, toast notifications
   Purely presentational helpers with no game or network logic in them.
   ========================================================================== */

export const UI = (() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const screens = {
    picker: $('picker'),
    modePicker: $('modePicker'),
    difficultyPicker: $('difficultyPicker'),
    lobby: $('lobby'),
    hosting: $('hosting'),
    game: $('game'),
  };

  const statusPill = $('statusPill');
  const statusText = $('statusText');
  const toastEl = $('toast');

  function showScreen(name) {
    Object.values(screens).forEach(s => s && s.classList.remove('active'));
    if (screens[name]) screens[name].classList.add('active');
  }

  function setStatus(state, text) {
    statusPill.className = 'status-pill' + (state ? ' ' + state : '');
    statusText.textContent = text;
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  return { $, showScreen, setStatus, toast };
})();
