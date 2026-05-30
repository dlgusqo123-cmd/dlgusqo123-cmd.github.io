const TOTAL_GEMS = 3;
const STAR_RADIUS = 78;
const CATCH_RADIUS = 86;
const STAR_SPEED = 38;
const MAX_FACES = 3;
const MAX_HANDS = 6;
const ITEM_TYPES = ["star", "heart", "gem"];
const GEM_COLORS = ["#ff5fa8", "#a66bff", "#5ea8ff", "#5ee6ff"];

const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const targetGem = document.querySelector("#targetGem");
const wandPointer = document.querySelector("#wandPointer");
const guide = document.querySelector("#guide");
const score = document.querySelector("#score");
const gemSlots = [...document.querySelectorAll(".slot")];
const accessoryLayer = document.querySelector("#accessoryLayer");
const sparkles = document.querySelector("#sparkles");
const camera = document.querySelector("#camera");
const handOverlay = document.querySelector("#handOverlay");
const cameraTint = document.querySelector("#cameraTint");
const status = document.querySelector("#status");
const togglePreview = document.querySelector("#togglePreview");
const restart = document.querySelector("#restart");
const startCamera = document.querySelector("#startCamera");
const startDemo = document.querySelector("#startDemo");
const parentNote = document.querySelector("#parentNote");
const gemHeart = targetGem.querySelector(".gem-heart");
const targetLabel = targetGem.querySelector(".target-label");

let collected = 0;
let mode = "idle";
let stream = null;
let handLandmarker = null;
let legacyHands = null;
let faceDetector = null;
let trackingEngine = "";
let animationId = null;
let lastVideoTime = -1;
let targetLocked = false;
let trackerReady = false;
let faceReady = false;
let framePending = false;
let facePending = false;
let lastFaceTime = 0;
let lastMoveTime = 0;
let activeHands = [];
let activeFaces = [];
let itemType = "star";
let enhanceLevel = 0;
const star = { x: 0, y: 0, vx: STAR_SPEED, vy: STAR_SPEED * 0.62 };

function resetGame() {
  collected = 0;
  targetLocked = false;
  lastMoveTime = 0;
  activeHands = [];
  activeFaces = [];
  enhanceLevel = 0;
  score.textContent = "0";
  gemSlots.forEach((slot) => slot.classList.remove("filled"));
  accessoryLayer.innerHTML = "";
  accessoryLayer.style.setProperty("--gem-color", GEM_COLORS[0]);
  accessoryLayer.style.setProperty("--sparkle-power", "1");
  targetGem.classList.remove("hidden", "collecting", "caught");
  targetGem.style.setProperty("--hold", "0");
  setNextItem();
  placeTarget(true);
  guide.textContent = mode === "camera" ? "손을 반짝이 가까이 가져가요" : "반짝이를 톡 눌러 잡아주세요";
}

function beginGame(nextMode) {
  mode = nextMode;
  welcome.classList.add("hidden");
  restart.classList.remove("hidden");
  wandPointer.classList.remove("hidden");
  resetGame();
  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(detectHands);
}

function setStatus(message) {
  status.textContent = message;
  status.classList.toggle("hidden", !message);
}

function showCameraLayer(show) {
  camera.classList.toggle("hidden", !show);
  handOverlay.classList.toggle("hidden", !show);
  cameraTint.classList.toggle("hidden", !show);
  stage.classList.toggle("camera-mode", show);
}

function sizeOverlay() {
  handOverlay.width = stage.clientWidth;
  handOverlay.height = stage.clientHeight;
}

function drawHand(hand) {
  const context = handOverlay.getContext("2d");
  sizeOverlay();
  context.clearRect(0, 0, handOverlay.width, handOverlay.height);
  if (!hand) return;
  const hands = Array.isArray(hand?.[0]) ? hand : [hand];
  context.fillStyle = "rgba(255, 215, 76, 0.95)";
  context.strokeStyle = "rgba(255, 245, 177, 0.72)";
  context.lineWidth = 3;
  hands.forEach((landmarks) => {
    landmarks.forEach((point) => {
      const x = point.x * handOverlay.width;
      const y = point.y * handOverlay.height;
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  });
}

function placeTarget(resetVelocity = false) {
  const bounds = stage.getBoundingClientRect();
  const margin = Math.min(STAR_RADIUS, bounds.width * 0.18);
  const usableWidth = Math.max(bounds.width - margin * 2, 1);
  const usableHeight = Math.max(bounds.height - margin * 2, 1);
  star.x = margin + usableWidth * (0.25 + Math.random() * 0.5);
  star.y = margin + usableHeight * (0.22 + Math.random() * 0.42);
  if (resetVelocity) {
    star.vx = (Math.random() > 0.5 ? 1 : -1) * (STAR_SPEED * (0.72 + Math.random() * 0.35));
    star.vy = (Math.random() > 0.5 ? 1 : -1) * (STAR_SPEED * (0.5 + Math.random() * 0.28));
  }
  renderTarget();
}

function renderTarget() {
  targetGem.style.left = `${star.x}px`;
  targetGem.style.top = `${star.y}px`;
}

function itemSvg(type) {
  if (type === "heart") {
    return `<svg viewBox="0 0 120 110" aria-hidden="true"><defs><linearGradient id="heartGel" x1="24" y1="12" x2="94" y2="98"><stop stop-color="#fff7ff"/><stop offset=".28" stop-color="#ffc4df"/><stop offset=".7" stop-color="#ff66ad"/><stop offset="1" stop-color="#c92775"/></linearGradient></defs><path class="item-main" d="M60 101C24 75 8 56 10 34c2-17 16-27 32-22 8 2 14 8 18 16 4-8 10-14 18-16 16-5 30 5 32 22 2 22-14 41-50 67Z" fill="url(#heartGel)"/><path class="item-shine" d="M31 30c8-10 20-10 28 1" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".72"/></svg>`;
  }
  if (type === "gem") {
    return `<svg viewBox="0 0 120 110" aria-hidden="true"><defs><linearGradient id="gemCut" x1="22" y1="8" x2="96" y2="104"><stop stop-color="#ffffff"/><stop offset=".26" stop-color="#ffd8ef"/><stop offset=".62" stop-color="#ff70b4"/><stop offset="1" stop-color="#8a42f5"/></linearGradient></defs><path class="item-main" d="M28 12h64l20 31-52 58L8 43 28 12Z" fill="url(#gemCut)"/><path d="M28 12 44 43 60 12 76 43 92 12M8 43h104M44 43l16 58 16-58" fill="none" stroke="#fff" stroke-width="4" opacity=".52"/><path class="item-shine" d="M33 27h18" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".82"/></svg>`;
  }
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="silverStar" x1="20" y1="10" x2="98" y2="108"><stop stop-color="#ffffff"/><stop offset=".25" stop-color="#f5f5ff"/><stop offset=".55" stop-color="#f7b3d4"/><stop offset="1" stop-color="#d8dce8"/></linearGradient></defs><path class="item-main" d="M60 6 74 42l39 3-30 25 9 39-32-21-32 21 9-39L7 45l39-3L60 6Z" fill="url(#silverStar)"/><path class="item-shine" d="M43 39 55 27" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/></svg>`;
}

function setNextItem() {
  itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  targetGem.dataset.kind = itemType;
  gemHeart.innerHTML = itemSvg(itemType);
  targetLabel.textContent = itemType === "star" ? "별빛" : itemType === "heart" ? "하트" : "보석";
}

function moveTarget(timestamp) {
  if (targetLocked || targetGem.classList.contains("hidden")) {
    lastMoveTime = timestamp;
    return;
  }
  if (!lastMoveTime) {
    lastMoveTime = timestamp;
    return;
  }
  const bounds = stage.getBoundingClientRect();
  const delta = Math.min((timestamp - lastMoveTime) / 1000, 0.05);
  const margin = Math.min(STAR_RADIUS, bounds.width * 0.18);
  lastMoveTime = timestamp;
  star.x += star.vx * delta;
  star.y += star.vy * delta;
  if (star.x < margin || star.x > bounds.width - margin) {
    star.vx *= -1;
    star.x = Math.max(margin, Math.min(bounds.width - margin, star.x));
  }
  if (star.y < margin || star.y > bounds.height - margin) {
    star.vy *= -1;
    star.y = Math.max(margin, Math.min(bounds.height - margin, star.y));
  }
  renderTarget();
}

function updatePointer(x, y, tracking = true) {
  wandPointer.style.left = `${x}px`;
  wandPointer.style.top = `${y}px`;
  if (!tracking || targetLocked || targetGem.classList.contains("hidden")) return;
  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const centerX = targetRect.left - stageRect.left + targetRect.width / 2;
  const centerY = targetRect.top - stageRect.top + targetRect.height / 2;
  const distance = Math.hypot(centerX - x, centerY - y);
  const pullDistance = CATCH_RADIUS * 2.6;
  if (distance < pullDistance) {
    const pull = Math.max(0, 1 - distance / pullDistance) * 0.08;
    star.x += (x - centerX) * pull;
    star.y += (y - centerY) * pull;
    renderTarget();
  }
  if (distance < CATCH_RADIUS) {
    targetGem.classList.add("collecting");
    guide.textContent = "잡았다!";
    collectGem();
    return;
  }
  targetGem.classList.remove("collecting");
  targetGem.style.setProperty("--hold", "0");
  if (mode !== "idle") {
    guide.textContent = distance < pullDistance ? "조금만 더 가까이!" : mode === "camera" ? "손을 반짝이 가까이 가져가요" : "반짝이를 톡 눌러 잡아주세요";
  }
}

function collectGem() {
  if (targetLocked) return;
  targetLocked = true;
  targetGem.classList.add("caught");
  burstAtTarget();
  collected += 1;
  score.textContent = `${collected}`;
  updateProgress();
  targetGem.classList.add("hidden");
  guide.textContent = nextRewardText();
  window.setTimeout(() => {
    targetLocked = false;
    setNextItem();
    placeTarget(true);
    targetGem.classList.remove("hidden", "caught");
  }, 520);
}

function transformStage() {
  return Math.min(4, Math.floor(collected / TOTAL_GEMS));
}

function updateProgress() {
  const inStep = collected % TOTAL_GEMS;
  const filledSlots = collected > 0 && inStep === 0 ? TOTAL_GEMS : inStep;
  gemSlots.forEach((slot, index) => {
    slot.classList.toggle("filled", index < filledSlots || collected >= 12);
  });
  enhanceLevel = Math.max(0, collected - 12);
  const color = GEM_COLORS[Math.floor(enhanceLevel / 2) % GEM_COLORS.length];
  accessoryLayer.style.setProperty("--gem-color", color);
  accessoryLayer.style.setProperty("--sparkle-power", `${Math.min(1.8, 1 + enhanceLevel * 0.08)}`);
  renderAccessories();
}

function nextRewardText() {
  if (collected === 3) return "귀걸이가 반짝!";
  if (collected === 6) return "목걸이도 생겼어요";
  if (collected === 9) return "드레스빛이 켜졌어요";
  if (collected === 12) return "왕관까지 완성!";
  if (collected > 12) return "보석빛이 더 강해져요";
  return "좋아요, 계속 모아봐요";
}

function burstAtTarget() {
  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const x = targetRect.left - stageRect.left + targetRect.width / 2;
  const y = targetRect.top - stageRect.top + targetRect.height / 2;
  for (let index = 0; index < 9; index += 1) {
    const sparkle = document.createElement("span");
    sparkle.className = "spark";
    sparkle.textContent = index % 2 === 0 ? "✦" : "♥";
    sparkle.style.left = `${x + (Math.random() - 0.5) * 100}px`;
    sparkle.style.top = `${y + (Math.random() - 0.5) * 75}px`;
    sparkle.style.animationDelay = `${index * 32}ms`;
    sparkles.append(sparkle);
    window.setTimeout(() => sparkle.remove(), 1000);
  }
}

function moveFromScreenPoint(clientX, clientY) {
  const bounds = stage.getBoundingClientRect();
  updatePointer(clientX - bounds.left, clientY - bounds.top, true);
}

stage.addEventListener("pointermove", (event) => { if (mode === "demo") moveFromScreenPoint(event.clientX, event.clientY); });
stage.addEventListener("pointerdown", (event) => { if (mode === "demo") moveFromScreenPoint(event.clientX, event.clientY); });

async function createHandLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
  const options = {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: MAX_HANDS,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  };
  try { return await HandLandmarker.createFromOptions(vision, options); }
  catch (_error) { options.baseOptions.delegate = "CPU"; return HandLandmarker.createFromOptions(vision, options); }
}

function loadScript(source, globalName) {
  return new Promise((resolve, reject) => {
    const previous = document.querySelector(`script[src="${source}"]`);
    if (previous) {
      if (!globalName || window[globalName]) { resolve(); return; }
      previous.addEventListener("load", resolve, { once: true });
      previous.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = source;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = () => reject(new Error("손 인식 파일을 불러오지 못했습니다."));
    document.head.append(script);
  });
}

function handleDetectedHand(hand) {
  drawHand(hand);
  activeHands = [];
  const hands = Array.isArray(hand?.[0]) ? hand : hand ? [hand] : [];
  hands.slice(0, MAX_HANDS).forEach((landmarks) => {
    const palmCenter = landmarks[9];
    const bounds = stage.getBoundingClientRect();
    activeHands.push({ x: (1 - palmCenter.x) * bounds.width, y: palmCenter.y * bounds.height });
  });
  if (activeHands.length) {
    const nearest = nearestHandToTarget();
    updatePointer(nearest.x, nearest.y, true);
  }
}

function nearestHandToTarget() {
  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const targetX = targetRect.left - stageRect.left + targetRect.width / 2;
  const targetY = targetRect.top - stageRect.top + targetRect.height / 2;
  return activeHands.reduce((nearest, hand) => {
    const distance = Math.hypot(hand.x - targetX, hand.y - targetY);
    return distance < nearest.distance ? { ...hand, distance } : nearest;
  }, { ...activeHands[0], distance: Number.POSITIVE_INFINITY });
}

function getFaceBox(detection) {
  const relativeBox = detection?.locationData?.relativeBoundingBox;
  if (relativeBox) return { xMin: relativeBox.xMin, yMin: relativeBox.yMin, width: relativeBox.width, height: relativeBox.height };
  const box = detection?.boundingBox;
  if (box?.xCenter !== undefined) return { xMin: box.xCenter - box.width / 2, yMin: box.yCenter - box.height / 2, width: box.width, height: box.height };
  return null;
}

function facePosition(box) {
  const bounds = stage.getBoundingClientRect();
  const faceCenterX = box.xMin + box.width / 2;
  const faceCenterY = box.yMin + box.height / 2;
  return {
    x: (1 - faceCenterX) * bounds.width,
    y: faceCenterY * bounds.height,
    width: box.width * bounds.width,
    height: box.height * bounds.height,
    scale: Math.min(1.24, Math.max(0.62, box.width * 4.1)),
  };
}

function handleFaceResults(results) {
  activeFaces = (results?.detections || []).map(getFaceBox).filter(Boolean).sort((a, b) => a.xMin - b.xMin).slice(0, MAX_FACES);
  renderAccessories();
}

function renderAccessories() {
  const stageLevel = transformStage();
  accessoryLayer.innerHTML = activeFaces.map((face, index) => princessSetSvg(facePosition(face), stageLevel, index)).join("");
}

function princessSetSvg(position, stageLevel, index) {
  const showEarrings = stageLevel >= 1;
  const showNecklace = stageLevel >= 2;
  const showDress = stageLevel >= 3;
  const showCrown = stageLevel >= 4;
  const sparkleCount = Math.min(10, 3 + enhanceLevel);
  const sparkle = Array.from({ length: sparkleCount }, (_, sparkleIndex) => {
    const angle = (sparkleIndex / sparkleCount) * Math.PI * 2;
    const radius = 62 + (sparkleIndex % 3) * 14;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.65;
    return `<i class="magic-dot" style="--x:${x}px;--y:${y}px;--d:${sparkleIndex * 80}ms"></i>`;
  }).join("");
  return `<div class="princess-set princess-${index}" style="left:${position.x}px;top:${position.y}px;--face-w:${position.width}px;--face-h:${position.height}px;--scale:${position.scale}">${showDress ? `<div class="dress-glow"></div>` : ""}${showCrown ? crownSvg() : ""}${showEarrings ? earringsSvg() : ""}${showNecklace ? necklaceSvg() : ""}${stageLevel >= 4 ? sparkle : ""}</div>`;
}

function crownSvg() {
  return `<svg class="accessory crown-filter" viewBox="0 0 220 128" aria-hidden="true"><defs><linearGradient id="silverCrown" x1="25" y1="10" x2="190" y2="118"><stop stop-color="#fff"/><stop offset=".22" stop-color="#f7f8ff"/><stop offset=".48" stop-color="#cfd5e5"/><stop offset=".74" stop-color="#ffffff"/><stop offset="1" stop-color="#aeb7cc"/></linearGradient><radialGradient id="pinkGem" cx=".35" cy=".25" r=".76"><stop stop-color="#fff"/><stop offset=".28" stop-color="#ffd5ee"/><stop offset=".68" stop-color="var(--gem-color)"/><stop offset="1" stop-color="#9b266d"/></radialGradient></defs><path class="silver-piece" d="M14 98 24 35l43 39 42-61 42 61 45-39 10 63c-49 21-142 21-192 0Z" fill="url(#silverCrown)"/><path d="M35 96c46 12 104 12 150 0" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".62"/><circle class="jewel main-jewel" cx="109" cy="68" r="18" fill="url(#pinkGem)"/><circle class="jewel" cx="61" cy="78" r="12" fill="url(#pinkGem)"/><circle class="jewel" cx="158" cy="78" r="12" fill="url(#pinkGem)"/><path d="M54 40c18 18 36 18 54-11 18 29 37 29 56 10" fill="none" stroke="#fff" stroke-width="6" opacity=".45"/></svg>`;
}

function earringsSvg() {
  return `<svg class="accessory earrings-filter" viewBox="0 0 220 100" aria-hidden="true"><defs><radialGradient id="earGem" cx=".35" cy=".25" r=".7"><stop stop-color="#fff"/><stop offset=".35" stop-color="#ffd7ef"/><stop offset="1" stop-color="var(--gem-color)"/></radialGradient></defs><g><circle cx="46" cy="28" r="10" fill="#f6f8ff"/><path d="M46 38 32 67l14 24 14-24Z" fill="url(#earGem)" stroke="#fff" stroke-width="4"/></g><g><circle cx="174" cy="28" r="10" fill="#f6f8ff"/><path d="M174 38 160 67l14 24 14-24Z" fill="url(#earGem)" stroke="#fff" stroke-width="4"/></g></svg>`;
}

function necklaceSvg() {
  return `<svg class="accessory necklace-filter" viewBox="0 0 220 100" aria-hidden="true"><defs><radialGradient id="neckGem" cx=".35" cy=".24" r=".72"><stop stop-color="#fff"/><stop offset=".34" stop-color="#ffd7ef"/><stop offset="1" stop-color="var(--gem-color)"/></radialGradient></defs><path d="M46 18c30 52 98 52 128 0" fill="none" stroke="#eef2ff" stroke-width="9" stroke-linecap="round"/><path d="M61 30c26 33 72 33 98 0" fill="none" stroke="#bfc8dc" stroke-width="4" stroke-linecap="round"/><path d="M110 63 91 35h38Z" fill="url(#neckGem)" stroke="#fff" stroke-width="4"/></svg>`;
}

async function createLegacyHands() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js", "Hands");
  if (!window.Hands) throw new Error("손 인식을 시작하지 못했습니다.");
  const tracker = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  tracker.setOptions({ maxNumHands: MAX_HANDS, modelComplexity: 0, minDetectionConfidence: 0.45, minTrackingConfidence: 0.45 });
  tracker.onResults((results) => handleDetectedHand(results.multiHandLandmarks || []));
  if (typeof tracker.initialize === "function") await tracker.initialize();
  return tracker;
}

async function createFaceDetector() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js", "FaceDetection");
  if (!window.FaceDetection) throw new Error("얼굴 인식을 시작하지 못했습니다.");
  const detector = new window.FaceDetection({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}` });
  detector.setOptions({ model: "short", minDetectionConfidence: 0.45 });
  detector.onResults(handleFaceResults);
  if (typeof detector.initialize === "function") await detector.initialize();
  return detector;
}

function timeoutAfter(milliseconds) {
  return new Promise((_, reject) => window.setTimeout(() => reject(new Error("인식 준비 시간이 너무 오래 걸렸습니다.")), milliseconds));
}

async function activateCamera() {
  startCamera.disabled = true;
  startCamera.textContent = "카메라를 준비하고 있어요...";
  parentNote.textContent = "카메라 사용 허용 창이 나오면 허용을 눌러 주세요.";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    camera.srcObject = stream;
    showCameraLayer(true);
    togglePreview.classList.remove("hidden");
    togglePreview.textContent = "내 모습 숨기기";
    beginGame("camera");
    guide.textContent = "내 모습이 보여요! 마법을 준비하고 있어요...";
    setStatus("손 인식 준비 중...");
    await camera.play();
    faceReady = false;
    facePending = false;
    lastFaceTime = 0;
    if (/Android/i.test(navigator.userAgent)) {
      legacyHands = await Promise.race([createLegacyHands(), timeoutAfter(25000)]);
      trackingEngine = "legacy";
    } else {
      try {
        handLandmarker = await Promise.race([createHandLandmarker(), timeoutAfter(25000)]);
        trackingEngine = "tasks";
      } catch (_error) {
        legacyHands = await Promise.race([createLegacyHands(), timeoutAfter(25000)]);
        trackingEngine = "legacy";
      }
    }
    try {
      faceDetector = await Promise.race([createFaceDetector(), timeoutAfter(12000)]);
      faceReady = true;
    } catch (_error) {
      faceReady = false;
    }
    trackerReady = true;
    setStatus("");
    guide.textContent = "반짝이를 손으로 잡아주세요";
  } catch (error) {
    console.error(error);
    trackerReady = false;
    if (mode === "camera") {
      guide.textContent = "손 인식에 문제가 있어요. 화면을 눌러 놀 수 있어요.";
      setStatus(`확인용 오류: ${error?.message || "인식 준비 실패"}`);
      mode = "demo";
    } else {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      showCameraLayer(false);
      parentNote.textContent = "카메라를 열지 못했어요. 카메라를 허용하거나, 화면 체험으로 먼저 놀아보세요.";
      startCamera.disabled = false;
      startCamera.textContent = "손으로 시작하기";
    }
  }
}

async function detectHands() {
  if (mode === "idle") return;
  moveTarget(performance.now());
  if (mode === "camera" && trackerReady && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    if (trackingEngine === "legacy" && legacyHands && !framePending) {
      framePending = true;
      try { await legacyHands.send({ image: camera }); }
      catch (error) { setStatus(`확인용 오류: ${error?.message || "손 인식 실행 실패"}`); }
      finally { framePending = false; }
    } else if (trackingEngine === "tasks" && handLandmarker) {
      const result = handLandmarker.detectForVideo(camera, performance.now());
      handleDetectedHand(result.landmarks || []);
    }
    const now = performance.now();
    if (faceReady && faceDetector && !facePending && now - lastFaceTime > 150) {
      facePending = true;
      lastFaceTime = now;
      faceDetector.send({ image: camera }).catch(() => { faceReady = false; }).finally(() => { facePending = false; });
    }
  }
  animationId = requestAnimationFrame(detectHands);
}

function startDemoGame() { trackerReady = false; beginGame("demo"); guide.textContent = "손가락으로 반짝이를 잡아보세요"; }
function restartCurrentGame() { resetGame(); }
function toggleCameraPreview() { const shown = !camera.classList.contains("hidden"); showCameraLayer(!shown); togglePreview.textContent = shown ? "내 모습 보기" : "내 모습 숨기기"; }

startCamera.addEventListener("click", activateCamera);
startDemo.addEventListener("click", startDemoGame);
restart.addEventListener("click", restartCurrentGame);
togglePreview.addEventListener("click", toggleCameraPreview);
window.addEventListener("resize", sizeOverlay);
window.addEventListener("beforeunload", () => { if (animationId) cancelAnimationFrame(animationId); stream?.getTracks().forEach((track) => track.stop()); });
