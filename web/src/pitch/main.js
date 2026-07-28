// KINESIS pitch deck — entry point for pitch.html.
import { createDeck } from './deck.js';

window.__stageSettled = false;

const deck = createDeck({
  root: document.getElementById('pitchRoot'),
  stage: document.getElementById('deckStage'),
});

// Presenter + headless-capture handles.
window.__deck = deck;
window.__deckReady = deck.ready.catch((err) => {
  console.error('[deck] boot failed', err);
  document.body.insertAdjacentHTML('beforeend',
    '<pre style="position:fixed;bottom:12px;left:12px;color:#C56B4A;'
    + 'font-family:ui-monospace,\'SF Mono\',Menlo,monospace;font-size:11px;z-index:99">'
    + `deck boot failed — ${String(err && err.message || err)}</pre>`);
  return false;
});
