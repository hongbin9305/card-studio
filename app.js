"use strict";

/* =========================================================
   FRAME LAB / T03 CARD STUDIO
========================================================= */

/* ---------- DOM ---------- */

const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");

const imageInput = document.getElementById("imageInput");
const fileMessage = document.getElementById("fileMessage");

const captionInput = document.getElementById("captionInput");
const fontSizeInput = document.getElementById("fontSizeInput");
const textColorInput = document.getElementById("textColorInput");
const textXInput = document.getElementById("textXInput");
const textYInput = document.getElementById("textYInput");

const ratioButtons = [...document.querySelectorAll(".ratio-button")];
const ratioLabel = document.getElementById("ratioLabel");
const previewStatus = document.getElementById("previewStatus");

const templateName = document.getElementById("templateName");
const saveTemplateButton = document.getElementById("saveTemplateButton");
const templateList = document.getElementById("templateList");

const exportJsonButton = document.getElementById("exportJsonButton");
const importJsonInput = document.getElementById("importJsonInput");
const jsonMessage = document.getElementById("jsonMessage");

const downloadPngButton = document.getElementById("downloadPngButton");
const downloadJpegButton = document.getElementById("downloadJpegButton");


/* ---------- CONSTANTS ---------- */

const STORAGE_KEY = "frameLabTemplates";

const RATIOS = {
  "1:1": {
    width: 1080,
    height: 1080
  },

  "4:5": {
    width: 1080,
    height: 1350
  },

  "9:16": {
    width: 1080,
    height: 1920
  }
};


/* ---------- CURRENT STATE ---------- */

let currentRatio = "1:1";
let currentImage = null;
let currentImageData = null;
let templates = loadTemplates();


/* =========================================================
   UTILITIES
========================================================= */

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.classList.remove("error", "success");

  if (type) {
    element.classList.add(type);
  }
}


function safeNumber(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}


function makeId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}


/* =========================================================
   CANVAS
========================================================= */

function resizeCanvas() {
  const size = RATIOS[currentRatio];

  canvas.width = size.width;
  canvas.height = size.height;

  ratioLabel.textContent =
    `${currentRatio} · ${size.width} × ${size.height}`;
}


function drawBackground() {
  const gradient = ctx.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height
  );

  gradient.addColorStop(0, "#18202b");
  gradient.addColorStop(0.5, "#111722");
  gradient.addColorStop(1, "#0b0f16");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(112, 240, 192, 0.08)";
  ctx.lineWidth = 2;

  const gap = 90;

  for (let x = -canvas.height; x < canvas.width; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + canvas.height, canvas.height);
    ctx.stroke();
  }
}


function drawCoverImage(image) {
  const canvasRatio = canvas.width / canvas.height;
  const imageRatio = image.width / image.height;

  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (imageRatio > canvasRatio) {
    drawHeight = canvas.height;
    drawWidth = image.width * (canvas.height / image.height);
    offsetX = (canvas.width - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = canvas.width;
    drawHeight = image.height * (canvas.width / image.width);
    offsetX = 0;
    offsetY = (canvas.height - drawHeight) / 2;
  }

  ctx.drawImage(
    image,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight
  );

  /* 문구 가독성을 위한 약한 오버레이 */
  const overlay = ctx.createLinearGradient(
    0,
    0,
    0,
    canvas.height
  );

  overlay.addColorStop(0, "rgba(0, 0, 0, 0.05)");
  overlay.addColorStop(0.55, "rgba(0, 0, 0, 0.08)");
  overlay.addColorStop(1, "rgba(0, 0, 0, 0.52)");

  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}


/* =========================================================
   TEXT DRAWING
========================================================= */

function getWrappedLines(text, maxWidth) {
  const paragraphs = String(text).split("\n");
  const lines = [];

  // 이모지와 결합 문자를 하나의 글자 단위로 처리
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ko", { granularity: "grapheme" })
    : null;

  function getCharacters(value) {
    return segmenter
      ? Array.from(segmenter.segment(value), item => item.segment)
      : Array.from(value);
  }

  function splitLongWord(word) {
    const result = [];
    let part = "";

    for (const character of getCharacters(word)) {
      const next = part + character;

      if (ctx.measureText(next).width > maxWidth && part) {
        result.push(part);
        part = character;
      } else {
        part = next;
      }
    }

    if (part) {
      result.push(part);
    }

    return result;
  }

  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine
        ? currentLine + " " + word
        : word;

      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      if (ctx.measureText(word).width <= maxWidth) {
        currentLine = word;
      } else {
        const parts = splitLongWord(word);
        lines.push(...parts.slice(0, -1));
        currentLine = parts[parts.length - 1] || "";
      }
    }

    lines.push(currentLine);
  }

  return lines;
}


function drawText() {
  const text = captionInput.value;

  if (!text) {
    return;
  }

  const baseSize = safeNumber(fontSizeInput.value, 58);

  /*
    컨트롤의 글자 크기는 1080px 기준.
    모든 출력 비율의 폭이 1080이므로
    화면과 다운로드 결과의 크기가 동일하게 유지된다.
  */
  const fontSize = Math.max(24, Math.min(120, baseSize));

  const xPercent = safeNumber(textXInput.value, 50);
  const yPercent = safeNumber(textYInput.value, 78);

  const x = canvas.width * (xPercent / 100);
  const y = canvas.height * (yPercent / 100);

  const maxWidth = canvas.width * 0.90;
  const lineHeight = fontSize * 1.28;

  ctx.save();

  ctx.font =
    `800 ${fontSize}px Arial, "Noto Sans KR", sans-serif`;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = textColorInput.value;

  ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;

  const lines = getWrappedLines(text, maxWidth);

  const totalHeight = (lines.length - 1) * lineHeight;

  let startY = y - totalHeight / 2;

  /*
    텍스트가 캔버스 바깥으로 완전히 빠지는 것을 방지.
  */
  const safeTop = fontSize;
  const safeBottom = canvas.height - fontSize;

  if (startY < safeTop) {
    startY = safeTop;
  }

  const lastLineY =
    startY + (lines.length - 1) * lineHeight;

  if (lastLineY > safeBottom) {
    startY -= lastLineY - safeBottom;
  }

  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      x,
      startY + index * lineHeight
    );
  });

  ctx.restore();
}


/* =========================================================
   RENDER
========================================================= */

function renderCanvas() {
  resizeCanvas();

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  if (currentImage) {
    drawCoverImage(currentImage);
  } else {
    drawBackground();
  }

  drawText();

  previewStatus.textContent = "UPDATED";
}


/* =========================================================
   IMAGE UPLOAD
========================================================= */

function handleImageFile(file) {
  if (!file) {
    return;
  }

  const allowedTypes = [
    "image/png",
    "image/jpeg"
  ];

  if (!allowedTypes.includes(file.type)) {
    setMessage(
      fileMessage,
      "지원하지 않는 파일입니다. PNG 또는 JPEG만 사용할 수 있습니다.",
      "error"
    );

    /*
      잘못된 파일을 선택해도 기존 이미지와 편집 내용은 유지.
    */
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();

    image.onload = () => {
      currentImage = image;
      currentImageData = reader.result;

      setMessage(
        fileMessage,
        `${file.name} · 이미지 불러오기 완료`,
        "success"
      );

      renderCanvas();
    };

    image.onerror = () => {
      setMessage(
        fileMessage,
        "이미지를 읽을 수 없습니다. 다른 PNG/JPEG 파일을 선택하세요.",
        "error"
      );
    };

    image.src = reader.result;
  };

  reader.onerror = () => {
    setMessage(
      fileMessage,
      "파일을 읽는 중 오류가 발생했습니다. 기존 작업은 유지됩니다.",
      "error"
    );
  };

  reader.readAsDataURL(file);
}


imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  handleImageFile(file);
});


/* =========================================================
   LIVE EDITING
========================================================= */

[
  captionInput,
  fontSizeInput,
  textColorInput,
  textXInput,
  textYInput
].forEach((input) => {
  input.addEventListener("input", renderCanvas);
});


ratioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentRatio = button.dataset.ratio;

    ratioButtons.forEach((item) => {
      item.classList.toggle(
        "active",
        item === button
      );
    });

    renderCanvas();
  });
});


/* =========================================================
   TEMPLATE DATA
========================================================= */

function getCurrentTemplateData() {
  return {
    caption: captionInput.value,
    fontSize: safeNumber(fontSizeInput.value, 58),
    textColor: textColorInput.value,
    textX: safeNumber(textXInput.value, 50),
    textY: safeNumber(textYInput.value, 78),
    ratio: currentRatio,
    imageData: currentImageData
  };
}


function isValidTemplateData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (typeof data.caption !== "string") {
    return false;
  }

  if (!Number.isFinite(Number(data.fontSize))) {
    return false;
  }

  if (typeof data.textColor !== "string") {
    return false;
  }

  if (!Number.isFinite(Number(data.textX))) {
    return false;
  }

  if (!Number.isFinite(Number(data.textY))) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(RATIOS, data.ratio)) {
    return false;
  }

  if (
    data.imageData !== null &&
    typeof data.imageData !== "string"
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        isValidTemplateData(item.data)
      );
    });
  } catch (error) {
    return [];
  }
}


function persistTemplates() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(templates)
    );

    return true;
  } catch (error) {
    setMessage(
      jsonMessage,
      "브라우저 저장공간에 저장할 수 없습니다. 이미지 크기를 줄여 다시 시도하세요.",
      "error"
    );

    return false;
  }
}


/* =========================================================
   TEMPLATE UI
========================================================= */

function renderTemplateList() {
  templateList.innerHTML = "";

  if (templates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "저장된 템플릿이 없습니다.";

    templateList.appendChild(empty);
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement("article");
    item.className = "template-item";

    const name = document.createElement("p");
    name.className = "template-name";
    name.textContent = template.name;

    const actions = document.createElement("div");
    actions.className = "template-actions";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.textContent = "LOAD";

    loadButton.addEventListener("click", () => {
      applyTemplate(template.data);

      setMessage(
        jsonMessage,
        `"${template.name}" 템플릿을 불러왔습니다.`,
        "success"
      );
    });

    const updateButton = document.createElement("button");
    updateButton.type = "button";
    updateButton.textContent = "UPDATE";

    updateButton.addEventListener("click", () => {
      template.data = getCurrentTemplateData();

      const newName = templateName.value.trim();

      if (newName) {
        template.name = newName;
      }

      if (persistTemplates()) {
        renderTemplateList();

        setMessage(
          jsonMessage,
          `"${template.name}" 템플릿을 수정했습니다.`,
          "success"
        );
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "DELETE";
    deleteButton.className = "delete-button";

    deleteButton.addEventListener("click", () => {
      const confirmed = window.confirm(
        `"${template.name}" 템플릿을 삭제할까요?`
      );

      if (!confirmed) {
        return;
      }

      templates = templates.filter(
        (item) => item.id !== template.id
      );

      if (persistTemplates()) {
        renderTemplateList();

        setMessage(
          jsonMessage,
          `"${template.name}" 템플릿을 삭제했습니다.`,
          "success"
        );
      }
    });

    actions.append(
      loadButton,
      updateButton,
      deleteButton
    );

    item.append(name, actions);
    templateList.appendChild(item);
  });
}


/* =========================================================
   SAVE TEMPLATE
========================================================= */

saveTemplateButton.addEventListener("click", () => {
  const name = templateName.value.trim();

  if (!name) {
    setMessage(
      jsonMessage,
      "템플릿 이름을 먼저 입력하세요.",
      "error"
    );

    templateName.focus();
    return;
  }

  const template = {
    id: makeId(),
    name,
    data: getCurrentTemplateData()
  };

  templates.push(template);

  if (!persistTemplates()) {
    templates.pop();
    return;
  }

  templateName.value = "";

  renderTemplateList();

  setMessage(
    jsonMessage,
    `"${name}" 템플릿을 저장했습니다.`,
    "success"
  );
});


/* =========================================================
   APPLY TEMPLATE
========================================================= */

function applyTemplate(data) {
  if (!isValidTemplateData(data)) {
    setMessage(
      jsonMessage,
      "템플릿 데이터가 올바르지 않습니다.",
      "error"
    );

    return;
  }

  captionInput.value = data.caption;
  fontSizeInput.value = data.fontSize;
  textColorInput.value = data.textColor;
  textXInput.value = data.textX;
  textYInput.value = data.textY;

  currentRatio = data.ratio;

  ratioButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.ratio === currentRatio
    );
  });

  currentImage = null;
  currentImageData = data.imageData;

  if (data.imageData) {
    const image = new Image();

    image.onload = () => {
      currentImage = image;
      renderCanvas();
    };

    image.onerror = () => {
      currentImage = null;
      currentImageData = null;
      renderCanvas();

      setMessage(
        jsonMessage,
        "템플릿의 이미지를 읽을 수 없어 이미지 없이 불러왔습니다.",
        "error"
      );
    };

    image.src = data.imageData;
  } else {
    renderCanvas();
  }
}


/* =========================================================
   JSON EXPORT
========================================================= */

exportJsonButton.addEventListener("click", () => {
  const backup = {
    app: "FRAME LAB",
    version: 1,
    templates
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    {
      type: "application/json"
    }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "frame-lab-templates.json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setMessage(
    jsonMessage,
    "JSON 백업 파일을 만들었습니다.",
    "success"
  );
});


/* =========================================================
   JSON IMPORT
========================================================= */

function validateBackup(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (data.app !== "FRAME LAB") {
    return false;
  }

  if (data.version !== 1) {
    return false;
  }

  if (!Array.isArray(data.templates)) {
    return false;
  }

  return data.templates.every((template) => {
    return (
      template &&
      typeof template.id === "string" &&
      typeof template.name === "string" &&
      template.name.trim() !== "" &&
      isValidTemplateData(template.data)
    );
  });
}


importJsonInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    /*
      기존 템플릿은 검증이 모두 끝나기 전까지 절대 변경하지 않는다.
    */
    let parsed;

    try {
      parsed = JSON.parse(reader.result);
    } catch (error) {
      setMessage(
        jsonMessage,
        "JSON 문법이 올바르지 않습니다. 기존 템플릿은 유지됩니다.",
        "error"
      );

      importJsonInput.value = "";
      return;
    }

    if (!validateBackup(parsed)) {
      setMessage(
        jsonMessage,
        "필수 항목이 없거나 지원하지 않는 JSON입니다. 기존 템플릿은 유지됩니다.",
        "error"
      );

      importJsonInput.value = "";
      return;
    }

    /*
      검증을 통과한 경우에만 교체한다.
    */
    const previousTemplates = templates;

    templates = parsed.templates.map((template) => ({
      id: template.id,
      name: template.name,
      data: {
        ...template.data
      }
    }));

    if (!persistTemplates()) {
      templates = previousTemplates;
      importJsonInput.value = "";
      return;
    }

    renderTemplateList();

    setMessage(
      jsonMessage,
      `${templates.length}개의 템플릿을 복원했습니다.`,
      "success"
    );

    importJsonInput.value = "";
  };

  reader.onerror = () => {
    setMessage(
      jsonMessage,
      "JSON 파일을 읽을 수 없습니다. 기존 템플릿은 유지됩니다.",
      "error"
    );

    importJsonInput.value = "";
  };

  reader.readAsText(file);
});


/* =========================================================
   DOWNLOAD
========================================================= */

function downloadCanvas(type) {
  /*
    미리보기와 다운로드가 동일한 canvas를 사용하므로
    이미지 잘림, 문구 위치, 줄바꿈이 동일하게 유지된다.
  */
  renderCanvas();

  let mimeType;
  let extension;

  if (type === "jpeg") {
    mimeType = "image/jpeg";
    extension = "jpg";
  } else {
    mimeType = "image/png";
    extension = "png";
  }

  const dataUrl = canvas.toDataURL(
    mimeType,
    0.94
  );

  const link = document.createElement("a");

  link.href = dataUrl;
  link.download =
    `frame-lab-${currentRatio.replace(":", "x")}.${extension}`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  previewStatus.textContent = "DOWNLOADED";
}


downloadPngButton.addEventListener("click", () => {
  downloadCanvas("png");
});


downloadJpegButton.addEventListener("click", () => {
  downloadCanvas("jpeg");
});


/* =========================================================
   INITIALIZE
========================================================= */

renderTemplateList();
renderCanvas();
