const MAX_HANDS = 6;
const ITEM_RADIUS = 76;
const CATCH_RADIUS = 86;
const ITEM_SPEED = 36;
const STAGES = [
  { key: "broom", name: "빗자루", reward: "방이 반짝 깨끗해졌어요" },
  { key: "invite", name: "초대장", reward: "무도회 초대장이 왔어요" },
  { key: "fairy", name: "요정빛", reward: "요정 마법이 나타났어요" },
  { key: "pumpkin", name: "호박", reward: "커다란 호박이 생겼어요" },
  { key: "wand", name: "지팡이", reward: "호박마차가 완성됐어요" },
  { key: "horseshoe", name: "말굽", reward: "마차 말이 도착했어요" },
  { key: "slipper", name: "유리구두", reward: "공주님이 준비됐어요" },
  { key: "gate", name: "성문", reward: "무도회가 시작됐어요" },
];
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [5, 9],
  [9, 10], [10, 11], [11, 12], [9, 13],
  [13, 14], [14, 15], [15, 16], [13, 17],
  [17, 18], [18, 19], [19, 20], [0, 17],
];

const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const targetGem = document.querySelector("#targetGem");
const wandPointer = document.querySelector("#wandPointer");
const guide = document.querySelector("#guide");
const score = document.querySelector("#score");
const gemSlots = [...document.querySelectorAll(".slot")];
const theaterLayer = document.querySelector("#accessoryLayer");
const sparkles = document.querySelector("#sparkles");
const camera = document.querySelector("#camera");
const handOverlay = document.querySelector("#handOverlay");
const cameraTint = document.querySelector("#cameraTint");
const status = document.querySelector("#status");
const togglePreview = document.querySelector("#togglePreview");
const restart = document.querySelector("#restart");
const startCamera = document.querySelector("#startCamera");
const parentNote = document.querySelector("#parentNote");
const gemHeart = targetGem.querySelector(".gem-heart");
const targetLabel = targetGem.querySelector(".target-label");

let collected = 0;
let mode = "idle";
let stream = null;
let hands = null;
let animationId = null;
let lastVideoTime = -1;
let targetLocked = false;
let trackerReady = false;
let framePending = false;
let lastMoveTime = 0;
let activeHands = [];

const floatingItem = { x: 0, y: 0, vx: ITEM_SPEED, vy: ITEM_SPEED * 0.62 };

function currentStage() { return STAGES[Math.floor(collected / 3) % STAGES.length]; }
function currentStageProgress() { return collected % 3; }
function completedStageCount() { return Math.floor(collected / 3); }
function storyLevel() {
  const completed = completedStageCount();
  if (completed > 0 && completed % STAGES.length === 0 && currentStageProgress() === 0) return STAGES.length;
  return (completed % STAGES.length) + 1;
}

function resetGame() {
  collected = 0;
  targetLocked = false;
  lastMoveTime = 0;
  activeHands = [];
  score.textContent = "0";
  targetGem.classList.remove("hidden", "collecting", "caught");
  renderTheater();
  setNextItem();
  updateSlots();
  placeTarget(true);
  guide.textContent = `${currentStage().name}빛을 3개 모아요`;
}

function beginGame() {
  mode = "camera";
  welcome.classList.add("hidden");
  restart.classList.remove("hidden");
  wandPointer.classList.remove("hidden");
  resetGame();
  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(detectHands);
}

function setStatus(message) { status.textContent = message; status.classList.toggle("hidden", !message); }
function showCameraLayer(show) {
  camera.classList.toggle("hidden", !show);
  handOverlay.classList.toggle("hidden", !show);
  cameraTint.classList.toggle("hidden", !show);
  stage.classList.toggle("camera-mode", show);
}
function sizeOverlay() { handOverlay.width = stage.clientWidth; handOverlay.height = stage.clientHeight; }

function drawHands(list) {
  const context = handOverlay.getContext("2d");
  sizeOverlay();
  context.clearRect(0, 0, handOverlay.width, handOverlay.height);
  list.forEach((landmarks, handIndex) => {
    const hue = handIndex % 2 === 0 ? "255, 112, 178" : "150, 116, 255";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = `rgba(${hue}, 0.78)`;
    context.lineWidth = 5;
    HAND_CONNECTIONS.forEach(([from, to]) => {
      const first = landmarks[from];
      const second = landmarks[to];
      if (!first || !second) return;
      context.beginPath();
      context.moveTo(first.x * handOverlay.width, first.y * handOverlay.height);
      context.lineTo(second.x * handOverlay.width, second.y * handOverlay.height);
      context.stroke();
    });
    context.fillStyle = `rgba(${hue}, 0.96)`;
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.lineWidth = 2.5;
    landmarks.forEach((point) => {
      context.beginPath();
      context.arc(point.x * handOverlay.width, point.y * handOverlay.height, 5.5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  });
}

function placeTarget(resetVelocity = false) {
  const bounds = stage.getBoundingClientRect();
  const margin = Math.min(ITEM_RADIUS, bounds.width * 0.18);
  const theaterReserve = Math.min(bounds.height * 0.42, 260);
  const usableWidth = Math.max(bounds.width - margin * 2, 1);
  const usableHeight = Math.max(bounds.height - theaterReserve - margin * 1.4, 1);
  floatingItem.x = margin + usableWidth * (0.2 + Math.random() * 0.6);
  floatingItem.y = margin + usableHeight * (0.16 + Math.random() * 0.62);
  if (resetVelocity) {
    floatingItem.vx = (Math.random() > 0.5 ? 1 : -1) * (ITEM_SPEED * (0.72 + Math.random() * 0.35));
    floatingItem.vy = (Math.random() > 0.5 ? 1 : -1) * (ITEM_SPEED * (0.5 + Math.random() * 0.28));
  }
  renderTarget();
}
function renderTarget() { targetGem.style.left = `${floatingItem.x}px`; targetGem.style.top = `${floatingItem.y}px`; }
function setNextItem() { const stageInfo = currentStage(); targetGem.dataset.kind = stageInfo.key; gemHeart.innerHTML = itemSvg(stageInfo.key); targetLabel.textContent = stageInfo.name; }

function itemSvg(type) {
  const defs = `<defs><linearGradient id="silver13" x1="18" y1="8" x2="108" y2="116"><stop stop-color="#fff"/><stop offset=".32" stop-color="#f4f9ff"/><stop offset=".68" stop-color="#b9dcff"/><stop offset="1" stop-color="#ffbde5"/></linearGradient><linearGradient id="gold13" x1="18" y1="8" x2="108" y2="116"><stop stop-color="#fff7cf"/><stop offset=".34" stop-color="#ffd66b"/><stop offset=".72" stop-color="#f39b36"/><stop offset="1" stop-color="#c86b2b"/></linearGradient><radialGradient id="pink13" cx=".34" cy=".24" r=".72"><stop stop-color="#fff"/><stop offset=".28" stop-color="#ffd8ef"/><stop offset=".74" stop-color="#ff67ad"/><stop offset="1" stop-color="#8e2a72"/></radialGradient></defs>`;
  if (type === "broom") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path class="item-main" d="M80 10 93 17 48 93l-13-7Z" fill="url(#silver13)"/><path class="item-main" d="M31 76c20 5 34 14 43 28-17 10-37 10-60 0 4-15 9-24 17-28Z" fill="url(#gold13)"/><path d="M31 82c14 8 27 16 39 25M20 98c19 7 35 7 49 0" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".65"/></svg>`;
  if (type === "invite") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<rect class="item-main" x="22" y="27" width="86" height="64" rx="11" fill="url(#silver13)"/><path d="M26 33 65 63l39-30M28 88l33-29M102 88 69 59" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".72"/><circle cx="65" cy="63" r="10" fill="url(#pink13)" stroke="#fff" stroke-width="4"/></svg>`;
  if (type === "fairy") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path class="item-main" d="M65 9 78 47l40 4-31 24 9 40-31-23-31 23 9-40-31-24 40-4Z" fill="url(#silver13)"/><circle cx="65" cy="62" r="15" fill="url(#pink13)" stroke="#fff" stroke-width="5"/><path d="M36 44 23 31M94 44l13-13M65 29V14" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".78"/></svg>`;
  if (type === "pumpkin") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path d="M66 33c19-8 45 2 45 33 0 31-22 43-47 43S17 96 17 66c0-31 27-41 47-33Z" class="item-main" fill="url(#gold13)"/><path d="M65 34c-12 9-16 63 0 74M43 38c-14 17-12 50 0 68M87 38c14 17 12 50 0 68" fill="none" stroke="#fff" stroke-width="5" opacity=".48"/><path d="M62 31c0-13 9-19 23-17" fill="none" stroke="#77b56d" stroke-width="7" stroke-linecap="round"/></svg>`;
  if (type === "wand") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path class="item-main" d="M89 13 100 23 36 106 25 96Z" fill="url(#silver13)"/><path d="M87 11 94 29 113 30 98 42 103 61 87 50 71 61 76 42 61 30 80 29Z" fill="url(#pink13)" stroke="#fff" stroke-width="4"/><path d="M32 40 18 31M41 25 36 10M107 72l14 8" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".75"/></svg>`;
  if (type === "horseshoe") return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path class="item-main" d="M31 42c0-22 17-35 34-35s34 13 34 35v32c0 22-14 39-34 39S31 96 31 74V42Zm21 4v29c0 9 5 15 13 15s13-6 13-15V46c0-9-5-15-13-15s-13 6-13 15Z" fill="url(#silver13)"/><circle cx="39" cy="44" r="5" fill="#fff"/><circle cx="91" cy="44" r="5" fill="#fff"/><circle cx="42" cy="80" r="5" fill="#fff"/><circle cx="88" cy="80" r="5" fill="#fff"/></svg>`;
  if (type === "slipper") return `<svg viewBox="0 0 140 120" aria-hidden="true">${defs}<path class="item-main" d="M20 75c30-1 56-10 79-38 8 8 18 17 29 22-8 21-32 31-68 31H26c-9 0-14-12-6-15Z" fill="url(#silver13)"/><path d="M83 40c9 13 22 20 39 20M38 77c25-1 47-9 65-26" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".72"/><circle cx="103" cy="57" r="8" fill="url(#pink13)"/></svg>`;
  return `<svg viewBox="0 0 130 120" aria-hidden="true">${defs}<path class="item-main" d="M20 104V58h18V38l18-17 18 17v20h18V43l18-17 18 17v61Z" fill="url(#silver13)"/><path d="M46 104V75c0-11 8-19 18-19s18 8 18 19v29" fill="url(#pink13)" stroke="#fff" stroke-width="4"/><path d="M27 58h20M85 58h22" stroke="#fff" stroke-width="6" opacity=".72"/></svg>`;
}

function moveTarget(timestamp) {
  if (targetLocked || targetGem.classList.contains("hidden")) { lastMoveTime = timestamp; return; }
  if (!lastMoveTime) { lastMoveTime = timestamp; return; }
  const bounds = stage.getBoundingClientRect();
  const theaterReserve = Math.min(bounds.height * 0.42, 260);
  const delta = Math.min((timestamp - lastMoveTime) / 1000, 0.05);
  const margin = Math.min(ITEM_RADIUS, bounds.width * 0.18);
  const maxY = bounds.height - theaterReserve - margin * 0.4;
  lastMoveTime = timestamp;
  floatingItem.x += floatingItem.vx * delta;
  floatingItem.y += floatingItem.vy * delta;
  if (floatingItem.x < margin || floatingItem.x > bounds.width - margin) { floatingItem.vx *= -1; floatingItem.x = Math.max(margin, Math.min(bounds.width - margin, floatingItem.x)); }
  if (floatingItem.y < margin || floatingItem.y > maxY) { floatingItem.vy *= -1; floatingItem.y = Math.max(margin, Math.min(maxY, floatingItem.y)); }
  renderTarget();
}

function updatePointer(x, y) {
  wandPointer.style.left = `${x}px`;
  wandPointer.style.top = `${y}px`;
  if (targetLocked || targetGem.classList.contains("hidden")) return;
  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const centerX = targetRect.left - stageRect.left + targetRect.width / 2;
  const centerY = targetRect.top - stageRect.top + targetRect.height / 2;
  const distance = Math.hypot(centerX - x, centerY - y);
  const pullDistance = CATCH_RADIUS * 2.6;
  if (distance < pullDistance) { const pull = Math.max(0, 1 - distance / pullDistance) * 0.08; floatingItem.x += (x - centerX) * pull; floatingItem.y += (y - centerY) * pull; renderTarget(); }
  if (distance < CATCH_RADIUS) { collectItem(); return; }
  guide.textContent = distance < pullDistance ? "조금만 더 가까이!" : `${currentStage().name}빛을 3개 모아요`;
}

function collectItem() {
  if (targetLocked) return;
  targetLocked = true;
  targetGem.classList.add("caught");
  burstAtTarget();
  collected += 1;
  score.textContent = `${collected}`;
  updateSlots();
  renderTheater();
  targetGem.classList.add("hidden");
  guide.textContent = rewardText();
  window.setTimeout(() => { targetLocked = false; setNextItem(); placeTarget(true); targetGem.classList.remove("hidden", "caught"); }, 560);
}

function updateSlots() { const filled = currentStageProgress() === 0 && collected > 0 ? 3 : currentStageProgress(); gemSlots.forEach((slot, index) => slot.classList.toggle("filled", index < filled)); }
function rewardText() {
  const progress = currentStageProgress();
  if (progress !== 0) return `${currentStage().name} ${progress}/3`;
  const completed = STAGES[(completedStageCount() - 1 + STAGES.length) % STAGES.length];
  if (completedStageCount() > 0 && completedStageCount() % STAGES.length === 0) return "무도회 한 편 완성! 다시 더 반짝여요";
  return completed.reward;
}
function renderTheater() { const level = storyLevel(); const cycle = Math.floor(completedStageCount() / STAGES.length); stage.dataset.story = `${level}`; stage.dataset.cycle = `${cycle}`; theaterLayer.innerHTML = theaterSvg(level, cycle); }
function theaterSvg(level, cycle) {
  const showInvite = level >= 2, showFairy = level >= 3, showPumpkin = level >= 4, showCoach = level >= 5, showHorses = level >= 6, showPrincess = level >= 7, showBall = level >= 8;
  return `<div class="story-theater"><div class="theater-title">${sceneTitle(level)}</div><svg class="story-svg" viewBox="0 0 1000 300" aria-hidden="true"><defs><linearGradient id="floor13" x1="0" y1="160" x2="1000" y2="300"><stop stop-color="#fff0fa"/><stop offset=".55" stop-color="#ffd3eb"/><stop offset="1" stop-color="#e7d3ff"/></linearGradient><linearGradient id="wall13" x1="0" y1="0" x2="1000" y2="210"><stop stop-color="#f7e7ff"/><stop offset=".7" stop-color="#ffe7f3"/><stop offset="1" stop-color="#fff9e7"/></linearGradient><linearGradient id="blueDress13" x1="0" y1="78" x2="0" y2="206"><stop stop-color="#ffffff"/><stop offset=".32" stop-color="#bfe6ff"/><stop offset="1" stop-color="#7ea5ff"/></linearGradient><linearGradient id="coach13" x1="545" y1="88" x2="815" y2="230"><stop stop-color="#fff5ca"/><stop offset=".38" stop-color="#ffc660"/><stop offset="1" stop-color="#e97e34"/></linearGradient><filter id="softShadow13"><feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#7c3e70" flood-opacity=".22"/></filter></defs><rect width="1000" height="300" rx="34" fill="url(#wall13)"/><path d="M0 204 C180 174 344 218 503 196 C675 172 798 196 1000 170 L1000 300 L0 300Z" fill="url(#floor13)"/>${houseSvg(level)}${cinderellaWorkSvg(level)}${showInvite ? inviteSceneSvg() : ""}${showFairy ? fairySceneSvg() : ""}${showPumpkin ? pumpkinSceneSvg(showCoach) : ""}${showCoach ? coachSvg(showHorses) : ""}${showHorses ? horseSvg() : ""}${showPrincess ? princessSvg(showBall) : ""}${showBall ? castleBallSvg(cycle) : ""}${sparkleSceneSvg(level, cycle)}</svg></div>`;
}
function sceneTitle(level) { return ["빗자루빛을 모아 방을 반짝여요", "무도회 초대장이 왔어요", "요정 마법이 나타났어요", "커다란 호박이 생겼어요", "호박마차가 완성됐어요", "마차 말이 도착했어요", "공주님이 준비됐어요", "무도회가 시작됐어요"][level - 1] || "빗자루빛을 모아 방을 반짝여요"; }
function houseSvg(level) { const light = level >= 2 ? "#fff1a8" : "#d8b3ce"; const opacity = level >= 5 ? 0.45 : 1; return `<g class="story-home" opacity="${opacity}" filter="url(#softShadow13)"><path d="M72 204V92h156v112Z" fill="#f1a1cc" stroke="#fff" stroke-width="6"/><path d="M54 100 150 34l98 66Z" fill="#b77ad0" stroke="#fff" stroke-width="7"/><rect x="92" y="132" width="38" height="48" rx="8" fill="${light}" stroke="#fff" stroke-width="5"/><rect x="170" y="127" width="38" height="74" rx="9" fill="#8f5c9d" stroke="#fff" stroke-width="5"/><path d="M80 208h180" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".7"/></g>`; }
function cinderellaWorkSvg(level) { if (level >= 7) return ""; const color = level >= 3 ? "#cfeeff" : "#b995c8"; const clean = level >= 2 ? `<path d="M94 226c44 13 104 13 154 0" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/>` : ""; return `<g class="cinderella-work" filter="url(#softShadow13)"><circle cx="312" cy="118" r="22" fill="#ffd7b7" stroke="#fff" stroke-width="5"/><path d="M291 101c16-26 46-16 45 13-18-3-31-1-45 8Z" fill="#8b5a58"/><path d="M285 210c12-56 49-56 67 0Z" fill="${color}" stroke="#fff" stroke-width="6"/><path d="M300 145c-22 15-38 38-46 65M337 145c22 15 37 38 45 65" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M256 71 267 76 225 216l-11-4Z" fill="#b9794b"/><path d="M205 204c23 4 39 12 50 29-24 13-51 9-72-6 5-13 10-21 22-23Z" fill="#d7a757" stroke="#fff" stroke-width="5"/>${clean}</g>`; }
function inviteSceneSvg() { return `<g class="invite-scene" filter="url(#softShadow13)"><rect x="362" y="76" width="94" height="66" rx="12" fill="#fffaf2" stroke="#fff" stroke-width="6"/><path d="M369 84 409 116l48-32M373 134l34-27M451 134l-37-27" fill="none" stroke="#e2afd1" stroke-width="5" stroke-linecap="round"/><circle cx="411" cy="116" r="10" fill="#ff78b9" stroke="#fff" stroke-width="4"/></g>`; }
function fairySceneSvg() { return `<g class="fairy-scene" filter="url(#softShadow13)"><circle cx="470" cy="88" r="20" fill="#ffd7b7" stroke="#fff" stroke-width="5"/><path d="M445 168c10-56 45-56 58 0Z" fill="#f7f7ff" stroke="#fff" stroke-width="6"/><path d="M436 118c-45-33-64 20-23 38M503 118c45-33 64 20 23 38" fill="#d9f2ff" stroke="#fff" stroke-width="5" opacity=".82"/><path d="M501 84 538 52" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M542 38 551 54 568 57 555 68 558 85 542 77 527 85 530 68 517 57 534 54Z" fill="#fff3a8" stroke="#fff" stroke-width="4"/></g>`; }
function pumpkinSceneSvg(hiddenByCoach) { if (hiddenByCoach) return ""; return `<g class="pumpkin-scene" filter="url(#softShadow13)"><path d="M654 181c44-21 109 2 109 59 0 36-41 48-84 48s-84-12-84-48c0-57 58-80 59-59Z" fill="#f69a34" stroke="#fff" stroke-width="7"/><path d="M681 181c-19 24-22 64 0 99M632 196c-16 27-9 57 10 77M730 196c16 27 9 57-10 77" fill="none" stroke="#fff5b7" stroke-width="6" opacity=".52"/><path d="M674 181c2-22 22-31 45-28" fill="none" stroke="#79bd69" stroke-width="9" stroke-linecap="round"/></g>`; }
function coachSvg(showHorses) { return `<g class="coach-scene" filter="url(#softShadow13)"><path d="M564 216c0-57 61-102 118-76 39 18 63 51 57 91-6 38-49 54-103 49-42-3-72-21-72-64Z" fill="url(#coach13)" stroke="#fff" stroke-width="8"/><path d="M619 164c22-28 67-26 89 8-20 23-68 23-89-8Z" fill="#fff0bf" stroke="#fff" stroke-width="6"/><circle cx="604" cy="271" r="24" fill="#b56f3b" stroke="#fff" stroke-width="7"/><circle cx="716" cy="271" r="24" fill="#b56f3b" stroke="#fff" stroke-width="7"/><circle cx="604" cy="271" r="9" fill="#fff0bf"/><circle cx="716" cy="271" r="9" fill="#fff0bf"/>${showHorses ? `<path d="M739 225c40-16 75-13 109 4" stroke="#fff" stroke-width="9" stroke-linecap="round"/>` : ""}</g>`; }
function horseSvg() { return `<g class="horse-scene" filter="url(#softShadow13)"><g transform="translate(792 166)"><path d="M26 38c20-29 63-24 83-1l29 33H33Z" fill="#f9f2ff" stroke="#fff" stroke-width="6"/><circle cx="104" cy="20" r="20" fill="#f9f2ff" stroke="#fff" stroke-width="6"/><path d="M115 4c13 7 20 18 22 32" stroke="#c799d9" stroke-width="7" stroke-linecap="round"/><path d="M43 70v39M89 70v39M122 70l14 39" stroke="#fff" stroke-width="8" stroke-linecap="round"/></g></g>`; }
function princessSvg(showBall) { return `<g class="princess-scene" filter="url(#softShadow13)" transform="translate(${showBall ? 438 : 478} 52)"><circle cx="52" cy="44" r="22" fill="#ffd7b7" stroke="#fff" stroke-width="5"/><path d="M29 37c9-31 48-34 58 1-26-5-45-4-58 6Z" fill="#b8794f"/><path d="M51 76c-33 33-50 85-56 154h112C101 161 84 109 51 76Z" fill="url(#blueDress13)" stroke="#fff" stroke-width="7"/><path d="M17 126c25 20 78 20 104 0M31 180c18 10 48 10 67 0" stroke="#fff" stroke-width="6" opacity=".7"/><path d="M9 232h95" stroke="#dff2ff" stroke-width="8" stroke-linecap="round"/></g>`; }
function castleBallSvg(cycle) { const glow = cycle > 0 ? "#bba2ff" : "#fff4a8"; return `<g class="castle-ball" filter="url(#softShadow13)"><path d="M747 265V136h42V94l38-37 38 37v42h42V107l37-37 38 37v158Z" fill="#d8d7ff" stroke="#fff" stroke-width="7"/><path d="M790 265v-57c0-27 18-45 41-45s41 18 41 45v57" fill="#967bd7" stroke="#fff" stroke-width="6"/><rect x="806" y="126" width="25" height="32" rx="8" fill="${glow}" stroke="#fff" stroke-width="4"/><rect x="899" y="145" width="25" height="32" rx="8" fill="${glow}" stroke="#fff" stroke-width="4"/><g transform="translate(676 105)"><circle cx="30" cy="30" r="19" fill="#ffd7b7" stroke="#fff" stroke-width="5"/><path d="M12 122c4-56 54-56 63 0Z" fill="#7aa0ff" stroke="#fff" stroke-width="6"/><path d="M18 22c16-25 44-19 50 5-20-3-37 0-50 9Z" fill="#73505f"/></g></g>`; }
function sparkleSceneSvg(level, cycle) { const amount = 8 + level * 2 + cycle * 3; return `<g class="story-sparkles">${Array.from({ length: amount }, (_, index) => { const x = 70 + ((index * 83) % 860); const y = 28 + ((index * 47) % 170); return `<text x="${x}" y="${y}" style="animation-delay:${index * 90}ms">✦</text>`; }).join("")}</g>`; }
function burstAtTarget() { const targetRect = targetGem.getBoundingClientRect(); const stageRect = stage.getBoundingClientRect(); const x = targetRect.left - stageRect.left + targetRect.width / 2; const y = targetRect.top - stageRect.top + targetRect.height / 2; for (let index = 0; index < 12; index += 1) { const sparkle = document.createElement("span"); sparkle.className = "spark"; sparkle.textContent = index % 3 === 0 ? "✦" : "♥"; sparkle.style.left = `${x + (Math.random() - 0.5) * 110}px`; sparkle.style.top = `${y + (Math.random() - 0.5) * 82}px`; sparkle.style.animationDelay = `${index * 28}ms`; sparkles.append(sparkle); window.setTimeout(() => sparkle.remove(), 1000); } }
function loadScript(source, globalName) { return new Promise((resolve, reject) => { if (window[globalName]) { resolve(); return; } const previous = document.querySelector(`script[src="${source}"]`); if (previous) { previous.addEventListener("load", resolve, { once: true }); previous.addEventListener("error", reject, { once: true }); return; } const script = document.createElement("script"); script.src = source; script.crossOrigin = "anonymous"; script.onload = resolve; script.onerror = () => reject(new Error("손 인식 프로그램을 불러오지 못했습니다.")); document.head.append(script); }); }
function handleDetectedHands(results) { const list = (results.multiHandLandmarks || []).slice(0, MAX_HANDS); drawHands(list); activeHands = []; const bounds = stage.getBoundingClientRect(); list.forEach((landmarks) => { const palmCenter = landmarks[9]; if (!palmCenter) return; activeHands.push({ x: (1 - palmCenter.x) * bounds.width, y: palmCenter.y * bounds.height }); }); if (!activeHands.length) return; const nearest = nearestHandToTarget(); updatePointer(nearest.x, nearest.y); }
function nearestHandToTarget() { const targetRect = targetGem.getBoundingClientRect(); const stageRect = stage.getBoundingClientRect(); const targetX = targetRect.left - stageRect.left + targetRect.width / 2; const targetY = targetRect.top - stageRect.top + targetRect.height / 2; return activeHands.reduce((nearest, hand) => { const distance = Math.hypot(hand.x - targetX, hand.y - targetY); return distance < nearest.distance ? { ...hand, distance } : nearest; }, { ...activeHands[0], distance: Number.POSITIVE_INFINITY }); }
async function activateCamera() { startCamera.disabled = true; startCamera.textContent = "카메라를 준비하고 있어요..."; parentNote.textContent = "카메라 사용 허용 창이 나오면 허용을 눌러 주세요."; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); camera.srcObject = stream; showCameraLayer(true); togglePreview.classList.remove("hidden"); togglePreview.textContent = "내 모습 숨기기"; beginGame(); guide.textContent = "내 모습이 보여요! 손 인식을 준비해요..."; setStatus("손 인식 준비 중..."); await camera.play(); await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js", "Hands"); hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` }); hands.setOptions({ maxNumHands: MAX_HANDS, modelComplexity: 0, minDetectionConfidence: 0.45, minTrackingConfidence: 0.45 }); hands.onResults(handleDetectedHands); if (typeof hands.initialize === "function") await hands.initialize(); trackerReady = true; setStatus(""); guide.textContent = `${currentStage().name}빛을 3개 모아요`; } catch (error) { console.error(error); trackerReady = false; guide.textContent = "손 인식에 문제가 있어요. 카메라와 조명을 확인해 주세요."; setStatus(`확인용 오류: ${error?.message || "손 인식 준비 실패"}`); startCamera.disabled = false; startCamera.textContent = "다시 시작하기"; } }
async function detectHands() { if (mode === "idle") return; moveTarget(performance.now()); if (trackerReady && camera.readyState >= 2 && camera.currentTime !== lastVideoTime && !framePending) { lastVideoTime = camera.currentTime; framePending = true; try { await hands.send({ image: camera }); } catch (error) { setStatus(`확인용 오류: ${error?.message || "손 인식 실행 실패"}`); } finally { framePending = false; } } animationId = requestAnimationFrame(detectHands); }
function restartCurrentGame() { resetGame(); }
function toggleCameraPreview() { const shown = !camera.classList.contains("hidden"); showCameraLayer(!shown); togglePreview.textContent = shown ? "내 모습 보기" : "내 모습 숨기기"; }
startCamera.addEventListener("click", activateCamera);
restart.addEventListener("click", restartCurrentGame);
togglePreview.addEventListener("click", toggleCameraPreview);
window.addEventListener("resize", sizeOverlay);
window.addEventListener("beforeunload", () => { if (animationId) cancelAnimationFrame(animationId); stream?.getTracks().forEach((track) => track.stop()); });
