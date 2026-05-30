const TOTAL_GEMS = 3;
const STAR_RADIUS = 78;
const GRAB_HOLD = 180;
const STAR_SPEED = 38;

const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const celebration = document.querySelector("#celebration");
const targetGem = document.querySelector("#targetGem");
const wandPointer = document.querySelector("#wandPointer");
const guide = document.querySelector("#guide");
const score = document.querySelector("#score");
const gemSlots = [...document.querySelectorAll(".slot")];
const crownBoard = document.querySelector("#crownBoard");
const headCrown = document.querySelector("#headCrown");
const crownGems = [...crownBoard.querySelectorAll(".crown-gem")];
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
const playAgain = document.querySelector("#playAgain");

let collected = 0;
let mode = "idle";
let stream = null;
let handLandmarker = null;
let legacyHands = null;
let faceDetector = null;
let trackingEngine = "";
let animationId = null;
let lastVideoTime = -1;
let grabStart = null;
let targetLocked = false;
let trackerReady = false;
let faceReady = false;
let framePending = false;
let facePending = false;
let lastFaceTime = 0;
let lastMoveTime = 0;
const star = {
  x: 0,
  y: 0,
  vx: STAR_SPEED,
  vy: STAR_SPEED * 0.62,
};

function resetGame() {
  collected = 0;
  targetLocked = false;
  grabStart = null;
  lastMoveTime = 0;
  score.textContent = `0 / ${TOTAL_GEMS}`;
  gemSlots.forEach((slot) => slot.classList.remove("filled"));
  crownGems.forEach((gem) => gem.classList.remove("filled"));
  headCrown.classList.add("hidden");
  headCrown.style.left = "50%";
  headCrown.style.top = "13%";
  crownBoard.classList.add("hidden");
  celebration.classList.add("hidden");
  targetGem.classList.remove("hidden", "collecting", "caught");
  targetGem.style.setProperty("--hold", "0");
  placeTarget(true);
  guide.textContent = mode === "camera" ? "손을 오므려 별을 잡아주세요" : "별을 톡 눌러 잡아주세요";
}

function beginGame(nextMode) {
  mode = nextMode;
  welcome.classList.add("hidden");
  restart.classList.remove("hidden");
  wandPointer.classList.remove("hidden");
  resetGame();
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
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
  if (!hand) {
    return;
  }

  context.fillStyle = "rgba(255, 215, 76, 0.95)";
  context.strokeStyle = "rgba(255, 245, 177, 0.72)";
  context.lineWidth = 3;
  hand.forEach((point) => {
    const x = point.x * handOverlay.width;
    const y = point.y * handOverlay.height;
    context.beginPath();
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
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

function updatePointer(x, y, tracking = true, grabbing = false) {
  wandPointer.style.left = `${x}px`;
  wandPointer.style.top = `${y}px`;

  if (!tracking || targetLocked || targetGem.classList.contains("hidden")) {
    clearGrab();
    return;
  }

  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const centerX = targetRect.left - stageRect.left + targetRect.width / 2;
  const centerY = targetRect.top - stageRect.top + targetRect.height / 2;
  const distance = Math.hypot(centerX - x, centerY - y);
  const inside = distance < targetRect.width * 0.45;

  if (!inside || !grabbing) {
    clearGrab(inside);
    return;
  }

  if (!grabStart) {
    grabStart = performance.now();
    targetGem.classList.add("collecting");
    guide.textContent = "잡았다!";
  }

  const progress = Math.min((performance.now() - grabStart) / GRAB_HOLD, 1);
  targetGem.style.setProperty("--hold", `${progress * 100}`);
  if (progress >= 1) {
    collectGem();
  }
}

function clearGrab(nearStar = false) {
  grabStart = null;
  targetGem.classList.remove("collecting");
  targetGem.style.setProperty("--hold", "0");
  if (collected < TOTAL_GEMS && mode !== "idle") {
    guide.textContent = nearStar ? "손을 오므려 잡아볼까요?" : mode === "camera" ? "움직이는 별을 천천히 따라가요" : "별을 톡 눌러 잡아주세요";
  }
}

function collectGem() {
  if (targetLocked) {
    return;
  }

  targetLocked = true;
  clearGrab();
  targetGem.classList.add("caught");
  burstAtTarget();
  gemSlots[collected].classList.add("filled");
  crownGems[collected].classList.add("filled");
  collected += 1;
  score.textContent = `${collected} / ${TOTAL_GEMS}`;
  targetGem.classList.add("hidden");

  if (collected === TOTAL_GEMS) {
    guide.textContent = "공주 왕관이 올라갔어요!";
    headCrown.classList.remove("hidden");
    window.setTimeout(() => celebration.classList.remove("hidden"), 1800);
    return;
  }

  guide.textContent = "짜잔! 새로운 별이 왔어요";
  window.setTimeout(() => {
    targetLocked = false;
    placeTarget(true);
    targetGem.classList.remove("hidden", "caught");
  }, 650);
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

function moveFromScreenPoint(clientX, clientY, grabbing = false) {
  const bounds = stage.getBoundingClientRect();
  updatePointer(clientX - bounds.left, clientY - bounds.top, true, grabbing);
}

stage.addEventListener("pointermove", (event) => {
  if (mode === "demo") {
    moveFromScreenPoint(event.clientX, event.clientY, event.buttons > 0);
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (mode === "demo") {
    moveFromScreenPoint(event.clientX, event.clientY, true);
  }
});

stage.addEventListener("pointerup", () => {
  if (mode === "demo") {
    clearGrab();
  }
});

async function createHandLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  };

  try {
    return await HandLandmarker.createFromOptions(vision, options);
  } catch (_error) {
    options.baseOptions.delegate = "CPU";
    return HandLandmarker.createFromOptions(vision, options);
  }
}

function loadScript(source, globalName) {
  return new Promise((resolve, reject) => {
    const previous = document.querySelector(`script[src="${source}"]`);
    if (previous) {
      if (!globalName || window[globalName]) {
        resolve();
        return;
      }
      previous.addEventListener("load", resolve, { once: true });
      previous.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = source;
    script.crossOrigin = "anonymous";
    script.onload = resolve;
    script.onerror = () => reject(new Error("태블릿 호환 손 인식 파일을 불러오지 못했습니다."));
    document.head.append(script);
  });
}

function handleDetectedHand(hand) {
  drawHand(hand);
  if (hand) {
    const palmCenter = hand[9];
    const bounds = stage.getBoundingClientRect();
    updatePointer((1 - palmCenter.x) * bounds.width, palmCenter.y * bounds.height, true, isHandGrabbing(hand));
  } else {
    clearGrab();
  }
}

function getFaceBox(detection) {
  const relativeBox = detection?.locationData?.relativeBoundingBox;
  if (relativeBox) {
    return {
      xMin: relativeBox.xMin,
      yMin: relativeBox.yMin,
      width: relativeBox.width,
      height: relativeBox.height,
    };
  }

  const box = detection?.boundingBox;
  if (box?.xCenter !== undefined) {
    return {
      xMin: box.xCenter - box.width / 2,
      yMin: box.yCenter - box.height / 2,
      width: box.width,
      height: box.height,
    };
  }

  return null;
}

function updateCrownFromFace(detection) {
  const box = getFaceBox(detection);
  if (!box) {
    return;
  }

  const bounds = stage.getBoundingClientRect();
  const faceCenterX = box.xMin + box.width / 2;
  const crownX = (1 - faceCenterX) * bounds.width;
  const crownY = Math.max(8, (box.yMin - box.height * 0.52) * bounds.height);
  const crownScale = Math.min(1.25, Math.max(0.74, box.width * 4.2));

  headCrown.style.left = `${crownX}px`;
  headCrown.style.top = `${crownY}px`;
  headCrown.style.setProperty("--crown-scale", crownScale);
}

function handleFaceResults(results) {
  const detection = results?.detections?.[0];
  if (detection) {
    updateCrownFromFace(detection);
  }
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function isHandGrabbing(hand) {
  const palmSize = Math.max(distanceBetween(hand[0], hand[9]), 0.001);
  const thumbToIndex = distanceBetween(hand[4], hand[8]) / palmSize;
  const foldedFingers = [8, 12, 16, 20].filter((tip) => {
    const base = tip - 3;
    return distanceBetween(hand[tip], hand[0]) < distanceBetween(hand[base], hand[0]) * 1.08;
  }).length;

  return thumbToIndex < 0.68 || foldedFingers >= 2;
}

async function createLegacyHands() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js", "Hands");
  if (!window.Hands) {
    throw new Error("태블릿 호환 손 인식을 시작하지 못했습니다.");
  }
  const tracker = new window.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  tracker.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.45,
    minTrackingConfidence: 0.45,
  });
  tracker.onResults((results) => handleDetectedHand(results.multiHandLandmarks?.[0]));
  if (typeof tracker.initialize === "function") {
    await tracker.initialize();
  }
  return tracker;
}

async function createFaceDetector() {
  await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js", "FaceDetection");
  if (!window.FaceDetection) {
    throw new Error("얼굴 인식을 시작하지 못했습니다.");
  }
  const detector = new window.FaceDetection({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
  });
  detector.setOptions({
    model: "short",
    minDetectionConfidence: 0.45,
  });
  detector.onResults(handleFaceResults);
  if (typeof detector.initialize === "function") {
    await detector.initialize();
  }
  return detector;
}

function timeoutAfter(milliseconds) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error("손 인식 준비 시간이 너무 오래 걸렸습니다.")), milliseconds);
  });
}

async function activateCamera() {
  startCamera.disabled = true;
  startCamera.textContent = "카메라를 준비하고 있어요...";
  parentNote.textContent = "카메라 사용 허용 창이 나오면 허용을 눌러 주세요.";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
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
      setStatus("태블릿 호환 손 인식 준비 중...");
      legacyHands = await Promise.race([createLegacyHands(), timeoutAfter(25000)]);
      trackingEngine = "legacy";
    } else {
      try {
        handLandmarker = await Promise.race([createHandLandmarker(), timeoutAfter(25000)]);
        trackingEngine = "tasks";
      } catch (_error) {
        setStatus("호환 손 인식으로 다시 준비 중...");
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
    guide.textContent = "움직이는 별을 손으로 잡아주세요";
  } catch (error) {
    console.error(error);
    trackerReady = false;

    if (mode === "camera") {
      guide.textContent = "손 인식에 문제가 있어요. 화면을 눌러 놀 수 있어요.";
      setStatus(`확인용 오류: ${error?.message || "손 인식 준비 실패"}`);
      mode = "demo";
    } else {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      showCameraLayer(false);
      parentNote.textContent =
        "카메라를 열지 못했어요. 카메라를 허용하거나, 화면 체험으로 먼저 놀아보세요.";
      startCamera.disabled = false;
      startCamera.textContent = "손으로 시작하기";
    }
  }
}

async function detectHands() {
  if (mode === "idle") {
    return;
  }

  moveTarget(performance.now());

  if (mode === "camera" && trackerReady && camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    if (trackingEngine === "legacy" && legacyHands && !framePending) {
      framePending = true;
      try {
        await legacyHands.send({ image: camera });
      } catch (error) {
        setStatus(`확인용 오류: ${error?.message || "태블릿 손 인식 실행 실패"}`);
      } finally {
        framePending = false;
      }
    } else if (trackingEngine === "tasks" && handLandmarker) {
      const result = handLandmarker.detectForVideo(camera, performance.now());
      handleDetectedHand(result.landmarks?.[0]);
    }

    const now = performance.now();
    if (faceReady && faceDetector && !facePending && now - lastFaceTime > 150) {
      facePending = true;
      lastFaceTime = now;
      faceDetector
        .send({ image: camera })
        .catch(() => {
          faceReady = false;
        })
        .finally(() => {
          facePending = false;
        });
    }
  }

  animationId = requestAnimationFrame(detectHands);
}

function startDemoGame() {
  trackerReady = false;
  beginGame("demo");
  guide.textContent = "손가락으로 별빛을 움직여 보석을 모아보세요";
}

function restartCurrentGame() {
  resetGame();
}

function toggleCameraPreview() {
  const shown = !camera.classList.contains("hidden");
  showCameraLayer(!shown);
  togglePreview.textContent = shown ? "내 모습 보기" : "내 모습 숨기기";
}

startCamera.addEventListener("click", activateCamera);
startDemo.addEventListener("click", startDemoGame);
restart.addEventListener("click", restartCurrentGame);
playAgain.addEventListener("click", restartCurrentGame);
togglePreview.addEventListener("click", toggleCameraPreview);

window.addEventListener("resize", sizeOverlay);
window.addEventListener("beforeunload", () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  stream?.getTracks().forEach((track) => track.stop());
});
