var app = document.getElementById("app");
var params = new URLSearchParams(window.location.search);
var screen = params.get("screen") || "board";
var requestedStudentId = params.get("student") || "student-1";

var assetManifest = {
  cafe: "/assets/background/cafe.png",
  station: "/assets/background/station.png",
  progress: "/assets/background/progress.png",
  cake: "/assets/ingredients/cake.png"
};

var toppingMeta = {
  strawberry: { key: "strawberry", label: "딸기", asset: "/assets/ingredients/strawberry.png", colorClass: "is-strawberry" },
  chocolate: { key: "chocolate", label: "초코", asset: "/assets/ingredients/chocolate.png", colorClass: "is-chocolate" },
  banana: { key: "banana", label: "바나나", asset: "/assets/ingredients/banana.png", colorClass: "is-banana" }
};

var toppingOrder = ["strawberry", "chocolate", "banana"];
var currentState = null;
var dragState = null;
var trayListenersBound = false;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function roundData(state) {
  if (!state || state.currentRoundIndex < 0) {
    return null;
  }
  return state.rounds[state.currentRoundIndex];
}

function getStudent(state, studentId) {
  return state && state.students ? state.students[studentId] : null;
}

function toppingOwner(state, toppingKey) {
  if (!state || !state.students) {
    return null;
  }
  var students = Object.keys(state.students);
  for (var index = 0; index < students.length; index += 1) {
    var student = state.students[students[index]];
    if (student.toppingKey === toppingKey) {
      return student;
    }
  }
  return null;
}

function toppingCountPlaced(round, toppingKey) {
  if (!round || !round.placements || !round.placements[toppingKey]) {
    return 0;
  }
  return round.placements[toppingKey].length;
}

function toppingRequired(round, toppingKey) {
  if (!round || !round.order) {
    return 0;
  }
  return round.order[toppingKey];
}

function maxSupply(student, requiredCount) {
  if (!student) {
    return 0;
  }
  return student.level === "da" ? requiredCount : 10;
}

function starsMarkup(stars) {
  var value = Math.max(0, Math.round(stars || 0));
  var items = [];
  for (var index = 0; index < 5; index += 1) {
    items.push('<span class="star ' + (index < value ? "is-filled" : "") + '">★</span>');
  }
  return items.join("");
}

function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (response) {
    return response.json().catch(function () {
      return {};
    });
  });
}

function isPlayerActive(state, student) {
  var round = roundData(state);
  return !!(round && student && round.activeToppingKey && student.toppingKey === round.activeToppingKey);
}

function selectionLockedForStudent(state, toppingKey, requestedId) {
  var owner = toppingOwner(state, toppingKey);
  return !!(owner && owner.id !== requestedId);
}

function boardClickHandler() {
  if (!currentState) {
    return;
  }

  if (currentState.scene === "title") {
    postJson("/api/board/action", { action: "advanceTitle" });
    return;
  }

  if (currentState.scene === "customer" && !currentState.orderRevealed) {
    postJson("/api/board/action", { action: "revealOrder" });
    return;
  }

  if (currentState.scene === "customer-result") {
    postJson("/api/board/action", { action: "advanceResult" });
  }
}

function renderTitleBoard() {
  app.innerHTML = [
    '<main class="screen board-screen screen--fulltap" id="board-screen">',
    '  <section class="hero hero--blurred">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="hero__shade"></div>',
    '    <div class="hero__content">',
    '      <h1 class="game-title">좋은 케이크,<br />위대한 케이크</h1>',
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");

  document.getElementById("board-screen").addEventListener("click", boardClickHandler);
}

function renderSelectionCards(state, isBoard) {
  var currentStudent = getStudent(state, requestedStudentId);
  return toppingOrder.map(function (toppingKey) {
    var meta = toppingMeta[toppingKey];
    var owner = toppingOwner(state, toppingKey);
    var ownerName = owner ? owner.label : "아직 선택 전";
    var selectedByMe = owner && owner.id === requestedStudentId;
    var disabled = !isBoard && (
      selectionLockedForStudent(state, toppingKey, requestedStudentId) ||
      !!(currentStudent && currentStudent.toppingKey && currentStudent.toppingKey !== toppingKey)
    );
    return [
      '<article class="selection-card ' + meta.colorClass + '">',
      '  <div class="selection-card__art"><img src="' + meta.asset + '" alt="' + meta.label + '" /></div>',
      '  <div class="selection-card__name">' + meta.label + "</div>",
      isBoard
        ? '  <div class="selection-card__owner">' + ownerName + "</div>"
        : '  <button class="action-button selection-card__button" type="button" data-select-topping="' + toppingKey + '" ' + (disabled ? "disabled" : "") + '>' + (selectedByMe ? "선택 완료" : "선택하기") + "</button>",
      "</article>"
    ].join("");
  }).join("");
}

function renderSelectionBoard(state) {
  app.innerHTML = [
    '<main class="screen board-screen">',
    '  <section class="scene scene--selection">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="scene__shade scene__shade--warm"></div>',
    '    <div class="selection-layout">',
    '      <header class="section-header">',
    '        <h1 class="section-title">토핑을 맡아 주세요</h1>',
    '        <p class="section-copy">딸기, 초코, 바나나를 한 명씩 고릅니다.</p>',
    "      </header>",
    '      <div class="selection-grid">' + renderSelectionCards(state, true) + "</div>",
    '      <div class="selection-footer">',
    '        <button class="action-button action-button--large" id="open-shop-button" ' + (state.selectionComplete ? "" : "disabled") + '>가게 문 열기</button>',
    "      </div>",
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");

  document.getElementById("open-shop-button").addEventListener("click", function () {
    postJson("/api/board/action", { action: "openShop" });
  });
}

function orderSlipMarkup(state, options) {
  var round = roundData(state);
  var compact = options && options.compact;
  var onlyTopping = options && options.onlyTopping;
  var iconNumberOnly = options && options.iconNumberOnly;
  if (!round) {
    return "";
  }

  var keys = onlyTopping ? [onlyTopping] : toppingOrder;
  return [
    '<div class="order-slip ' + (compact ? "order-slip--compact" : "") + '">',
    '  <div class="order-slip__items">',
    keys.map(function (toppingKey) {
      var meta = toppingMeta[toppingKey];
      var isDone = round.completedToppings.indexOf(toppingKey) !== -1;
      var count = toppingRequired(round, toppingKey);
      return [
        '<button class="order-item ' + (isDone ? "is-done " : "") + (iconNumberOnly ? "order-item--icon-number " : "") + '" type="button" data-activate-topping="' + toppingKey + '" ' + (screen === "board" ? "" : "disabled") + '>',
        '  <span class="order-item__icon"><img src="' + meta.asset + '" alt="' + meta.label + '" /></span>',
        iconNumberOnly
          ? '  <span class="order-item__count-only">' + count + "</span>"
          : '  <span class="order-item__text"><span class="order-item__label-text">' + meta.label + '</span> <span class="order-item__count-strong">' + count + '</span><span class="order-item__count-unit">개</span></span>',
        isDone ? '  <span class="order-item__check">✓</span>' : "",
        "</button>"
      ].join("");
    }).join(""),
    "  </div>",
    "</div>"
  ].join("");
}

function customerSceneMarkup(state) {
  var round = roundData(state);
  if (!round) {
    return "";
  }

  return [
    '<section class="scene scene--customer' + (state.orderRevealed ? " is-order-open" : "") + '">',
    '  <div class="backdrop is-cafe"></div>',
    '  <div class="scene__shade"></div>',
    '  <div class="customer-figure"><img src="' + round.customerAsset + '" alt="손님" /></div>',
    state.orderRevealed ? '<div class="customer-order">' + orderSlipMarkup(state) + "</div>" : "",
    "</section>"
  ].join("");
}

function renderBoardCustomer(state) {
  app.innerHTML = ['<main class="screen board-screen" id="board-screen">', customerSceneMarkup(state), "</main>"].join("");

  document.getElementById("board-screen").addEventListener("click", function (event) {
    if (event.target && event.target.closest && event.target.closest("[data-activate-topping]")) {
      return;
    }
    boardClickHandler();
  });

  attachOrderActivation();
}

function placementLayerMarkup(round) {
  return toppingOrder.map(function (toppingKey) {
    return (round.placements[toppingKey] || []).map(function (placement, index) {
      var meta = toppingMeta[toppingKey];
      var rotate = ((index % 5) - 2) * 8;
      return '<img class="placed-topping ' + meta.colorClass + '" src="' + meta.asset + '" alt="' + meta.label + '" style="left:' + placement.x + "%; top:" + placement.y + "%; transform: translate(-50%, -50%) rotate(" + rotate + 'deg);" />';
    }).join("");
  }).join("");
}

function progressSceneMarkup(state, isBoard) {
  var round = roundData(state);
  var activeToppingKey = round ? round.activeToppingKey : null;
  var activeStudent = activeToppingKey ? toppingOwner(state, activeToppingKey) : null;
  return [
    '<section class="scene scene--progress">',
    '  <div class="backdrop ' + (isBoard ? "is-progress" : "is-station") + '"></div>',
    '  <div class="scene__shade scene__shade--soft"></div>',
    '  <div class="progress-layout">',
    isBoard
      ? '    <div class="mini-order">' + orderSlipMarkup(state, { compact: true, iconNumberOnly: true }) + "</div>"
      : "",
    '    <div class="cake-stage">',
    '      <div class="cake-stage__surface" id="cake-surface">',
    '        <img class="cake-stage__cake" src="' + assetManifest.cake + '" alt="케이크" />',
    '        <div class="cake-stage__placements">' + placementLayerMarkup(round || { placements: {} }) + "</div>",
    "      </div>",
    "    </div>",
    isBoard
      ? '    <div class="progress-turn-label">' + (activeStudent ? escapeHtml(activeStudent.label + "가 만드는 중") : "") + "</div>"
      : "",
    "  </div>",
    "</section>"
  ].join("");
}

function renderBoardDecorate(state) {
  app.innerHTML = ['<main class="screen board-screen">', progressSceneMarkup(state, true), "</main>"].join("");
  attachOrderActivation();
}

function resultSceneMarkup(state) {
  var round = roundData(state);
  return [
    '<section class="scene scene--result">',
    '  <div class="backdrop is-cafe"></div>',
    '  <div class="scene__shade scene__shade--result"></div>',
    state.resultDismissed
      ? '  <div class="result-wait">다음 손님을 맞이할 준비가 되었어요.</div>'
      : [
          '  <div class="result-card">',
          '    <div class="result-card__customer"><img src="' + round.customerAsset + '" alt="손님" /></div>',
          '    <div class="result-card__bubble">',
          '      <p class="result-card__message">' + escapeHtml(round.thanks) + "</p>",
          '      <p class="result-card__message result-card__message--small">' + escapeHtml(round.resultMessage) + "</p>",
          '      <div class="result-stars">' + starsMarkup(round.resultStars) + "</div>",
          "    </div>",
          "  </div>"
        ].join(""),
    "</section>"
  ].join("");
}

function renderBoardResult(state) {
  app.innerHTML = ['<main class="screen board-screen screen--fulltap" id="board-screen">', resultSceneMarkup(state), "</main>"].join("");
  document.getElementById("board-screen").addEventListener("click", boardClickHandler);
}

function renderBoardFinal(state) {
  app.innerHTML = [
    '<main class="screen board-screen screen--fulltap">',
    '  <section class="hero hero--blurred">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="hero__shade"></div>',
    '    <div class="hero__content">',
    '      <h1 class="game-title game-title--small">오늘의 가게 평점</h1>',
    '      <div class="final-stars">' + starsMarkup(Math.round(state.finalStars)) + "</div>",
    '      <p class="final-score">평균 ' + escapeHtml(state.finalStars) + "점</p>",
    '      <button class="action-button" id="reset-button" type="button">다시 시작하기</button>',
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");

  document.getElementById("reset-button").addEventListener("click", function () {
    postJson("/api/board/action", { action: "resetGame" });
  });
}

function renderWaitingPlayer(message) {
  app.innerHTML = [
    '<main class="screen player-screen">',
    '  <section class="hero hero--blurred">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="hero__shade hero__shade--soft"></div>',
    '    <div class="hero__content">',
    '      <h1 class="player-title">' + escapeHtml(message) + "</h1>",
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");
}

function renderPlayerSelection(state, student) {
  app.innerHTML = [
    '<main class="screen player-screen">',
    '  <section class="scene scene--selection">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="scene__shade scene__shade--warm"></div>',
    '    <div class="selection-layout selection-layout--player">',
    '      <header class="section-header">',
    '        <h1 class="section-title">' + escapeHtml(student.label) + '</h1>',
    '        <p class="section-copy">맡을 토핑을 선택해 주세요.</p>',
    "      </header>",
    '      <div class="selection-grid selection-grid--player">' + renderSelectionCards(state, false) + "</div>",
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");

  var buttons = app.querySelectorAll("[data-select-topping]");
  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener("click", function () {
      postJson("/api/student/select", {
        studentId: student.id,
        toppingKey: button.getAttribute("data-select-topping")
      });
    });
  });
}

function renderPlayerOrder(state, student) {
  app.innerHTML = [
    '<main class="screen player-screen">',
    '  <section class="scene scene--player-order">',
    '    <div class="backdrop is-cafe is-blurred"></div>',
    '    <div class="scene__shade scene__shade--warm"></div>',
    '    <div class="player-order-card">',
    orderSlipMarkup(state, { onlyTopping: student.toppingKey }),
    "    </div>",
    "  </section>",
    "</main>"
  ].join("");
}

function renderPlayerStation(state, student) {
  var round = roundData(state);
  var requiredCount = toppingRequired(round, student.toppingKey);
  var placedCount = toppingCountPlaced(round, student.toppingKey);
  var supplyCount = maxSupply(student, requiredCount);
  var remaining = Math.max(0, supplyCount - placedCount);
  var trayItems = [];
  var index;

  for (index = 0; index < remaining; index += 1) {
    var angle = ((index % 5) - 2) * 9;
    var offsetX = (index % 4) * 28 + (index % 2) * 4;
    var offsetY = Math.floor(index / 4) * 24 + ((index + 1) % 2) * 6;
    trayItems.push(
      '<button class="tray-piece" type="button" data-tray-index="' + index + '" style="left:' + offsetX + "px; top:" + offsetY + "px; transform: rotate(" + angle + 'deg);">' +
        '<img src="' + toppingMeta[student.toppingKey].asset + '" alt="' + toppingMeta[student.toppingKey].label + '" />' +
      "</button>"
    );
  }

  app.innerHTML = [
    '<main class="screen player-screen">',
    progressSceneMarkup(state, false),
    '  <div class="player-station-ui">',
    '    <div class="station-ticket">' + orderSlipMarkup(state, { compact: true, onlyTopping: student.toppingKey }) + "</div>",
    '    <div class="station-pile">',
    '      <div class="station-pile__items" id="tray-items">' + trayItems.join("") + "</div>",
    "    </div>",
    '    <button class="action-button station-finish" type="button" id="finish-turn-button">완성!</button>',
    "  </div>",
    "</main>"
  ].join("");

  if (remaining > 0) {
    attachTrayDrag(student);
  }

  document.getElementById("finish-turn-button").addEventListener("click", function () {
    postJson("/api/student/finish", { studentId: student.id });
  });
}

function renderBoard(state) {
  if (state.scene === "title") {
    renderTitleBoard();
    return;
  }
  if (state.scene === "selection") {
    renderSelectionBoard(state);
    return;
  }
  if (state.scene === "customer") {
    renderBoardCustomer(state);
    return;
  }
  if (state.scene === "decorate") {
    renderBoardDecorate(state);
    return;
  }
  if (state.scene === "customer-result") {
    renderBoardResult(state);
    return;
  }
  if (state.scene === "final") {
    renderBoardFinal(state);
  }
}

function renderPlayer(state) {
  var student = getStudent(state, requestedStudentId);
  var round = roundData(state);

  if (!student) {
    app.innerHTML = '<main class="screen"><div class="missing">학생 정보를 찾을 수 없어요.</div></main>';
    return;
  }

  if (state.scene === "title") {
    renderWaitingPlayer("전자칠판에서 게임을 시작해 주세요.");
    return;
  }

  if (state.scene === "selection") {
    renderPlayerSelection(state, student);
    return;
  }

  if (state.scene === "customer") {
    if (!state.orderRevealed) {
      renderWaitingPlayer("손님이 주문 중이에요.");
      return;
    }
    if (!student.toppingKey) {
      renderWaitingPlayer("먼저 맡을 토핑을 정해 주세요.");
      return;
    }
    renderPlayerOrder(state, student);
    return;
  }

  if (state.scene === "decorate") {
    if (!round || !student.toppingKey) {
      renderWaitingPlayer("차례를 기다려 주세요.");
      return;
    }
    if (isPlayerActive(state, student) && !round.turnFinishedByStudentId[student.id]) {
      renderPlayerStation(state, student);
      return;
    }
    renderWaitingPlayer("다른 친구의 차례예요. 잠시 기다려 주세요.");
    return;
  }

  if (state.scene === "customer-result") {
    renderWaitingPlayer("손님이 케이크를 평가하고 있어요.");
    return;
  }

  if (state.scene === "final") {
    renderWaitingPlayer("오늘 가게 영업이 끝났어요.");
  }
}

function attachOrderActivation() {
  var buttons = app.querySelectorAll("[data-activate-topping]");
  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      postJson("/api/board/action", {
        action: "activateTopping",
        toppingKey: button.getAttribute("data-activate-topping")
      }).then(function (response) {
        if (response && response.error) {
          window.alert("아직 이전 학생 차례가 끝나지 않았어요.");
        }
      });
    });
  });
}

function pointerCoordinates(event) {
  if (event.touches && event.touches.length) {
    return {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY
    };
  }
  if (event.changedTouches && event.changedTouches.length) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY
    };
  }
  return {
    x: event.clientX,
    y: event.clientY
  };
}

function clearGhost() {
  if (dragState && dragState.ghost && dragState.ghost.parentNode) {
    dragState.ghost.parentNode.removeChild(dragState.ghost);
  }
  dragState = null;
}

function updateGhostPosition(coords) {
  if (!dragState || !dragState.ghost) {
    return;
  }
  dragState.ghost.style.left = coords.x + "px";
  dragState.ghost.style.top = coords.y + "px";
}

function finishDrop(student, coords) {
  var surface = document.getElementById("cake-surface");
  if (!surface) {
    clearGhost();
    return;
  }

  var rect = surface.getBoundingClientRect();
  var inside = coords.x >= rect.left && coords.x <= rect.right && coords.y >= rect.top && coords.y <= rect.bottom;

  if (inside) {
    var x = ((coords.x - rect.left) / rect.width) * 100;
    var y = ((coords.y - rect.top) / rect.height) * 100;
    postJson("/api/student/place", {
      studentId: student.id,
      x: x,
      y: y
    }).then(function (response) {
      if (response && response.error) {
        window.alert(response.error);
      }
    });
  }

  clearGhost();
}

function attachTrayDrag(student) {
  var trayButtons = document.querySelectorAll("[data-tray-index]");
  Array.prototype.forEach.call(trayButtons, function (button) {
    function startDrag(event) {
      event.preventDefault();
      event.stopPropagation();
      var coords = pointerCoordinates(event);
      var ghost = document.createElement("img");
      ghost.className = "drag-ghost";
      ghost.src = toppingMeta[student.toppingKey].asset;
      ghost.alt = toppingMeta[student.toppingKey].label;
      document.body.appendChild(ghost);
      dragState = {
        studentId: student.id,
        student: student,
        ghost: ghost
      };
      updateGhostPosition(coords);
    }

    button.addEventListener("mousedown", startDrag);
    button.addEventListener("touchstart", startDrag, { passive: false });
    button.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });
  });

  if (!trayListenersBound) {
    document.addEventListener("mousemove", function (event) {
      if (!dragState) {
        return;
      }
      updateGhostPosition(pointerCoordinates(event));
    });

    document.addEventListener("touchmove", function (event) {
      if (!dragState) {
        return;
      }
      event.preventDefault();
      updateGhostPosition(pointerCoordinates(event));
    }, { passive: false });

    document.addEventListener("mouseup", function (event) {
      if (!dragState) {
        return;
      }
      finishDrop(dragState.student, pointerCoordinates(event));
    });

    document.addEventListener("touchend", function (event) {
      if (!dragState) {
        return;
      }
      finishDrop(dragState.student, pointerCoordinates(event));
    });

    trayListenersBound = true;
  }
}

function render(state) {
  currentState = state;
  if (screen === "board") {
    renderBoard(state);
    return;
  }
  renderPlayer(state);
}

function subscribeEvents() {
  var source = new EventSource("/events");
  source.onmessage = function (event) {
    render(JSON.parse(event.data));
  };
}

fetch("/api/state")
  .then(function (response) {
    return response.json();
  })
  .then(function (state) {
    render(state);
    subscribeEvents();
  });
