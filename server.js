const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const studentsTemplate = [
  { id: "student-1", label: "수호", level: "ga" },
  { id: "student-2", label: "의찬이", level: "na" },
  { id: "student-3", label: "지후", level: "da" }
];

const toppings = [
  { key: "strawberry", label: "딸기", asset: "/assets/ingredients/strawberry.png" },
  { key: "chocolate", label: "초코", asset: "/assets/ingredients/chocolate.png" },
  { key: "banana", label: "바나나", asset: "/assets/ingredients/banana.png" }
];

const customers = [
  { id: "customer-1", asset: "/assets/customers/1.png", thanks: "정성이 가득 담긴 케이크네요!" },
  { id: "customer-2", asset: "/assets/customers/2.png", thanks: "가게가 정말 바빠 보였는데 완성해 줘서 고마워요!" },
  { id: "customer-3", asset: "/assets/customers/3.png", thanks: "토핑이 듬뿍 올라가서 기분이 좋아졌어요!" }
];

function shuffle(list) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = temp;
  }
  return copy;
}

function randomCount() {
  return Math.floor(Math.random() * 9) + 1;
}

function createStudents() {
  const students = {};
  studentsTemplate.forEach((student) => {
    students[student.id] = {
      id: student.id,
      label: student.label,
      level: student.level,
      toppingKey: null
    };
  });
  return students;
}

function createRound(customer) {
  const order = {};
  toppings.forEach((topping) => {
    order[topping.key] = randomCount();
  });

  return {
    customerId: customer.id,
    customerAsset: customer.asset,
    thanks: customer.thanks,
    order,
    placements: {
      strawberry: [],
      chocolate: [],
      banana: []
    },
    completedToppings: [],
    activeToppingKey: null,
    turnFinishedByStudentId: {},
    resultStars: null,
    resultMessage: ""
  };
}

function createInitialState() {
  return {
    scene: "title",
    boardMessage: "아무 곳이나 눌러 게임을 시작하세요.",
    students: createStudents(),
    rounds: [],
    currentRoundIndex: -1,
    selectionLocked: false,
    selectionComplete: false,
    orderRevealed: false,
    resultDismissed: false,
    finalStars: 0
  };
}

let state = createInitialState();
const clients = new Set();

function currentRound() {
  if (state.currentRoundIndex < 0 || state.currentRoundIndex >= state.rounds.length) {
    return null;
  }
  return state.rounds[state.currentRoundIndex];
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function broadcast() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  clients.forEach((client) => {
    client.write(payload);
  });
}

function updateBoardMessage(message) {
  state.boardMessage = message;
}

function getStudent(studentId) {
  return state.students[studentId];
}

function findStudentByTopping(toppingKey) {
  const students = Object.values(state.students);
  for (let index = 0; index < students.length; index += 1) {
    if (students[index].toppingKey === toppingKey) {
      return students[index];
    }
  }
  return null;
}

function countAssignedStudents() {
  return Object.values(state.students).filter((student) => student.toppingKey).length;
}

function syncSelectionState() {
  state.selectionComplete = countAssignedStudents() === toppings.length;
}

function createRounds() {
  return shuffle(customers).map((customer) => createRound(customer));
}

function maxSupplyForStudent(student, requiredCount) {
  if (!student) {
    return 0;
  }
  return student.level === "da" ? requiredCount : 10;
}

function computeStars(order, placements) {
  let difference = 0;
  toppings.forEach((topping) => {
    difference += Math.abs(order[topping.key] - placements[topping.key].length);
  });

  if (difference === 0) {
    return 5;
  }
  if (difference <= 3) {
    return 4;
  }
  return 3;
}

function finishRoundIfReady() {
  const round = currentRound();
  if (!round) {
    return false;
  }

  if (round.completedToppings.length !== toppings.length) {
    return false;
  }

  const stars = computeStars(round.order, round.placements);
  round.resultStars = stars;
  round.resultMessage = stars === 5
    ? "주문과 똑같이 완성됐어요!"
    : stars === 4
      ? "조금만 더 맞추면 완벽한 케이크예요!"
      : "다음 손님에게는 더 정확하게 만들어 봐요!";

  state.scene = "customer-result";
  state.resultDismissed = false;
  updateBoardMessage("손님의 평가를 확인해 보세요.");
  return true;
}

function startService() {
  state.rounds = createRounds();
  state.currentRoundIndex = 0;
  state.scene = "customer";
  state.orderRevealed = false;
  state.resultDismissed = false;
  updateBoardMessage("손님이 들어왔어요. 화면을 눌러 주문서를 확인하세요.");
}

function moveToNextRoundOrFinal() {
  if (state.currentRoundIndex >= state.rounds.length - 1) {
    let total = 0;
    state.rounds.forEach((round) => {
      total += round.resultStars || 0;
    });
    state.finalStars = Math.round((total / state.rounds.length) * 10) / 10;
    state.scene = "final";
    updateBoardMessage("오늘의 가게 평점이 나왔어요.");
    return;
  }

  state.currentRoundIndex += 1;
  state.scene = "customer";
  state.orderRevealed = false;
  state.resultDismissed = false;
  updateBoardMessage("다음 손님이 들어왔어요. 화면을 눌러 주문서를 확인하세요.");
}

function handleBoardAction(body, res) {
  const action = body.action;
  const round = currentRound();

  if (action === "advanceTitle") {
    if (state.scene !== "title") {
      return sendJson(res, 409, { error: "Invalid scene" });
    }
    state.scene = "selection";
    updateBoardMessage("학생들이 토핑을 골라 주세요.");
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (action === "openShop") {
    if (state.scene !== "selection" || !state.selectionComplete) {
      return sendJson(res, 409, { error: "Not ready" });
    }
    state.selectionLocked = true;
    startService();
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (action === "revealOrder") {
    if (state.scene !== "customer" || state.orderRevealed) {
      return sendJson(res, 409, { error: "Invalid action" });
    }
    state.orderRevealed = true;
    updateBoardMessage("주문서의 토핑을 눌러 학생 차례를 시작하세요.");
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (action === "activateTopping") {
    const toppingKey = body.toppingKey;
    if (state.scene !== "customer" && state.scene !== "decorate") {
      return sendJson(res, 409, { error: "Invalid scene" });
    }
    if (!state.orderRevealed || !round) {
      return sendJson(res, 409, { error: "Order not visible" });
    }
    if (round.completedToppings.indexOf(toppingKey) !== -1) {
      return sendJson(res, 409, { error: "Already complete" });
    }
    if (round.activeToppingKey) {
      const activeStudent = findStudentByTopping(round.activeToppingKey);
      if (activeStudent && !round.turnFinishedByStudentId[activeStudent.id]) {
        return sendJson(res, 409, { error: "Current turn not finished" });
      }
    }

    const student = findStudentByTopping(toppingKey);
    if (!student) {
      return sendJson(res, 404, { error: "Student not assigned" });
    }

    round.activeToppingKey = toppingKey;
    state.scene = "decorate";
    updateBoardMessage(`${student.label}의 ${toppings.find((item) => item.key === toppingKey).label} 차례입니다.`);
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (action === "advanceResult") {
    if (state.scene !== "customer-result") {
      return sendJson(res, 409, { error: "Invalid scene" });
    }

    if (!state.resultDismissed) {
      state.resultDismissed = true;
      updateBoardMessage("한 번 더 누르면 다음 손님이 들어와요.");
    } else {
      moveToNextRoundOrFinal();
    }
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (action === "resetGame") {
    state = createInitialState();
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 400, { error: "Unknown action" });
}

function handleStudentSelect(body, res) {
  const student = getStudent(body.studentId);
  const toppingKey = body.toppingKey;

  if (!student) {
    return sendJson(res, 404, { error: "Student not found" });
  }
  if (state.scene !== "selection" || state.selectionLocked) {
    return sendJson(res, 409, { error: "Selection closed" });
  }
  if (!toppings.find((topping) => topping.key === toppingKey)) {
    return sendJson(res, 400, { error: "Unknown topping" });
  }
  if (student.toppingKey && student.toppingKey !== toppingKey) {
    return sendJson(res, 409, { error: "Selection already fixed" });
  }

  const owner = findStudentByTopping(toppingKey);
  if (owner && owner.id !== student.id) {
    return sendJson(res, 409, { error: "Already selected" });
  }

  student.toppingKey = toppingKey;
  syncSelectionState();

  if (state.selectionComplete) {
    updateBoardMessage("준비가 끝났어요. 가게 문을 열어 주세요.");
  } else {
    updateBoardMessage("학생들이 토핑을 고르고 있어요.");
  }

  broadcast();
  return sendJson(res, 200, { ok: true });
}

function handleStudentPlace(body, res) {
  const student = getStudent(body.studentId);
  const round = currentRound();

  if (!student) {
    return sendJson(res, 404, { error: "Student not found" });
  }
  if (!round || state.scene !== "decorate") {
    return sendJson(res, 409, { error: "Not decorating" });
  }
  if (student.toppingKey !== round.activeToppingKey) {
    return sendJson(res, 409, { error: "Not active student" });
  }
  if (round.turnFinishedByStudentId[student.id]) {
    return sendJson(res, 409, { error: "Turn finished" });
  }

  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return sendJson(res, 400, { error: "Invalid coordinates" });
  }

  const clampedX = Math.max(6, Math.min(94, x));
  const clampedY = Math.max(10, Math.min(90, y));
  const requiredCount = round.order[student.toppingKey];
  const maxSupply = maxSupplyForStudent(student, requiredCount);
  const placedCount = round.placements[student.toppingKey].length;

  if (placedCount >= maxSupply) {
    return sendJson(res, 409, { error: "No toppings left" });
  }

  const placements = round.placements[student.toppingKey];
  let stackOffset = 0;

  placements.forEach((item) => {
    const dx = item.x - clampedX;
    const dy = item.y - clampedY;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance < 8) {
      stackOffset += 3.2;
    }
  });

  placements.push({
    id: `${student.id}-${Date.now()}-${placedCount + 1}`,
    x: clampedX,
    y: Math.max(8, clampedY - stackOffset),
    toppingKey: student.toppingKey,
    studentId: student.id
  });

  broadcast();
  return sendJson(res, 200, { ok: true });
}

function handleStudentFinish(body, res) {
  const student = getStudent(body.studentId);
  const round = currentRound();

  if (!student) {
    return sendJson(res, 404, { error: "Student not found" });
  }
  if (!round || state.scene !== "decorate") {
    return sendJson(res, 409, { error: "Not decorating" });
  }
  if (student.toppingKey !== round.activeToppingKey) {
    return sendJson(res, 409, { error: "Not active student" });
  }

  round.turnFinishedByStudentId[student.id] = true;
  if (round.completedToppings.indexOf(student.toppingKey) === -1) {
    round.completedToppings.push(student.toppingKey);
  }
  round.activeToppingKey = null;

  if (!finishRoundIfReady()) {
    state.scene = "decorate";
    updateBoardMessage("주문서에서 다른 토핑을 눌러 다음 학생 차례를 시작하세요.");
  }

  broadcast();
  return sendJson(res, 200, { ok: true });
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".ttf": "font/ttf",
      ".otf": "font/otf",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml"
    };

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "text/plain; charset=utf-8" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, state);
  }

  if (req.method === "POST" && url.pathname === "/api/board/action") {
    try {
      const body = await parseBody(req);
      return handleBoardAction(body, res);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/student/select") {
    try {
      const body = await parseBody(req);
      return handleStudentSelect(body, res);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/student/place") {
    try {
      const body = await parseBody(req);
      return handleStudentPlace(body, res);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/student/finish") {
    try {
      const body = await parseBody(req);
      return handleStudentFinish(body, res);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const safePath = path.normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  serveFile(filePath, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Count Cake server listening on http://${HOST}:${PORT}`);
});
