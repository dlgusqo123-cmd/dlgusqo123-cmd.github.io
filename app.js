const TOTAL_GEMS = 3;
const HOLD_DURATION = 1000;
const positions = [
  { x: 25, y: 40 },
  { x: 74, y: 37 },
  { x: 47, y: 51 },
];

const stage = document.querySelector("#stage");
const welcome = document.querySelector("#welcome");
const celebration = document.querySelector("#celebration");
const targetGem = document.querySelector("#targetGem");
const wandPointer = document.querySelector("#wandPointer");
const guide = document.querySelector("#guide");
const score = document.querySelector("#score");
const gemSlots = [...document.querySelectorAll(".slot")];
const crownGems = [...document.querySelectorAll(".crown-gem")];
const sparkles = document.querySelector("#sparkles");
const camera = document.querySelector("#camera");
const cameraPreview = document.querySelector("#cameraPreview");
const togglePreview = document.querySelector("#togglePreview");
const restart = document.querySelector("#restart");
const startCamera = document.querySelector("#startCamera");
const startDemo = document.querySelector("#startDemo");
const parentNote = document.querySelector("#parentNote");
const playAgain = document.querySelector("#playAgain");

let collected = 0;
let mode = "idle";
let stream = null;
let gestureRecognizer = null;
let animationId = null;
let lastVideoTime = -1;
let holdStart = null;
let targetLocked = false;

function resetGame() {
  collected = 0;
  targetLocked = false;
  holdStart = null;
  score.textContent = `0 / ${TOTAL_GEMS}`;
  gemSlots.forEach((slot) => slot.classList.remove("filled"));
  crownGems.forEach((gem) => gem.classList.remove("filled"));
  celebration.classList.add("hidden");
  targetGem.classList.remove("hidden", "collecting");
  targetGem.style.setProperty("--hold", "0");
  placeTarget();
  guide.textContent = mode === "camera" ? "손을 보석 위에 천천히 올려주세요" : "별빛을 움직여 보석을 모아주세요";
}

function beginGame(nextMode) {
  mode = nextMode;
  welcome.classList.add("hidden");
  restart.classList.remove("hidden");
  wandPointer.classList.remove("hidden");
  resetGame();
}

function placeTarget() {
  const nextPosition = positions[collected % positions.length];
  targetGem.style.left = `${nextPosition.x}%`;
  targetGem.style.top = `${nextPosition.y}%`;
}

function updatePointer(x, y, tracking = true) {
  wandPointer.style.left = `${x}px`;
  wandPointer.style.top = `${y}px`;

  if (!tracking || targetLocked || targetGem.classList.contains("hidden")) {
    clearHold();
    return;
  }

  const targetRect = targetGem.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const centerX = targetRect.left - stageRect.left + targetRect.width / 2;
  const centerY = targetRect.top - stageRect.top + targetRect.height / 2;
  const distance = Math.hypot(centerX - x, centerY - y);
  const inside = distance < targetRect.width * 0.45;

  if (!inside) {
    clearHold();
    return;
  }

  if (!holdStart) {
    holdStart = performance.now();
    targetGem.classList.add("collecting");
    guide.textContent = "좋아요! 그대로 기다려요";
  }

  const progress = Math.min((performance.now() - holdStart) / HOLD_DURATION, 1);
  targetGem.style.setProperty("--hold", `${progress * 100}`);
  if (progress >= 1) {
    collectGem();
  }
}

function clearHold() {
  holdStart = null;
  targetGem.classList.remove("collecting");
  targetGem.style.setProperty("--hold", "0");
  if (collected < TOTAL_GEMS && mode !== "idle") {
    guide.textContent = mode === "camera" ? "손을 보석 위에 천천히 올려주세요" : "별빛을 움직여 보석을 모아주세요";
  }
}

function collectGem() {
  if (targetLocked) {
    return;
  }

  targetLocked = true;
  clearHold();
  burstAtTarget();
  gemSlots[collected].classList.add("filled");
  crownGems[collected].classList.add("filled");
  collected += 1;
  score.textContent = `${collected} / ${TOTAL_GEMS}`;
  targetGem.classList.add("hidden");

  if (collected === TOTAL_GEMS) {
    guide.textContent = "왕관이 완성됐어요!";
    window.setTimeout(() => celebration.classList.remove("hidden"), 550);
    return;
  }

  guide.textContent = "짜잔! 새로운 보석을 찾아요";
  window.setTimeout(() => {
    targetLocked = false;
    placeTarget();
    targetGem.classList.remove("hidden");
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

function moveFromScreenPoint(clientX, clientY) {
  const bounds = stage.getBoundingClientRect();
  updatePointer(clientX - bounds.left, clientY - bounds.top);
}

stage.addEventListener("pointermove", (event) => {
  if (mode === "demo") {
    moveFromScreenPoint(event.clientX, event.clientY);
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (mode === "demo") {
    moveFromScreenPoint(event.clientX, event.clientY);
  }
});

async function createGestureRecognizer() {
  const { FilesetResolver, GestureRecognizer } = window.vision;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );
  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  };

  try {
    return await GestureRecognizer.createFromOptions(vision, options);
  } catch (_error) {
    options.baseOptions.delegate = "CPU";
    return GestureRecognizer.createFromOptions(vision, options);
  }
}

async function activateCamera() {
  startCamera.disabled = true;
  startCamera.textContent = "카메라를 준비하고 있어요...";
  parentNote.textContent = "카메라 사용 허용 창이 나오면 허용을 눌러 주세요.";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 540 },
      },
      audio: false,
    });
    camera.srcObject = stream;
    await camera.play();
    gestureRecognizer = await createGestureRecognizer();
    togglePreview.classList.remove("hidden");
    beginGame("camera");
    detectHands();
  } catch (error) {
    console.error(error);
    parentNote.textContent =
      "카메라를 열지 못했어요. 안전한 웹 주소에서 카메라를 허용하거나, 화면 체험으로 먼저 놀아보세요.";
    startCamera.disabled = false;
    startCamera.textContent = "손으로 시작하기";
  }
}

function detectHands() {
  if (mode !== "camera" || !gestureRecognizer) {
    return;
  }

  if (camera.readyState >= 2 && camera.currentTime !== lastVideoTime) {
    lastVideoTime = camera.currentTime;
    const result = gestureRecognizer.recognizeForVideo(camera, performance.now());
    const hand = result.landmarks?.[0];

    if (hand) {
      const palmCenter = hand[9];
      const bounds = stage.getBoundingClientRect();
      const x = (1 - palmCenter.x) * bounds.width;
      const y = palmCenter.y * bounds.height;
      updatePointer(x, y);
    } else {
      clearHold();
    }
  }

  animationId = requestAnimationFrame(detectHands);
}

function startDemoGame() {
  beginGame("demo");
  guide.textContent = "손가락으로 별빛을 움직여 보석을 모아보세요";
}

function restartCurrentGame() {
  resetGame();
}

function toggleCameraPreview() {
  const previewShown = !cameraPreview.classList.contains("hidden");
  cameraPreview.classList.toggle("hidden", previewShown);
  togglePreview.textContent = previewShown ? "카메라 보기" : "카메라 숨기기";
}

startCamera.addEventListener("click", activateCamera);
startDemo.addEventListener("click", startDemoGame);
restart.addEventListener("click", restartCurrentGame);
playAgain.addEventListener("click", restartCurrentGame);
togglePreview.addEventListener("click", toggleCameraPreview);

window.addEventListener("beforeunload", () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  stream?.getTracks().forEach((track) => track.stop());
});
