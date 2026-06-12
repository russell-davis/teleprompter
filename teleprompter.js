"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const LS = "teleprompter.standalone.v1";

  // ---------- state ----------
  const state = {
    scripts: [{ name: "Script 1", text: "" }],
    current: 0,
    size: 52,
    speed: 40,      // px / sec
    width: 80,      // % usable width (smaller = narrower column)
    mirror: false,
    flipV: false,
    line: false,
    countdown: true,
    obsHost: "ws://localhost:4455",
    obsPass: "",          // saved so we can auto-reconnect (local file, low risk)
    obsAutoConnect: false, // becomes true after the first successful connect
  };

  // ---------- persistence ----------
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return;
      const o = JSON.parse(raw);
      // migrate old single-script format ({ text: "..." })
      if (o && typeof o.text === "string" && !o.scripts) {
        o.scripts = [{ name: "Script 1", text: o.text }];
        o.current = 0;
        delete o.text;
      }
      Object.assign(state, o);
      if (!Array.isArray(state.scripts) || !state.scripts.length) {
        state.scripts = [{ name: "Script 1", text: "" }];
      }
      if (state.current >= state.scripts.length) state.current = 0;
    } catch (e) {}
  }

  const kebab = (s) => (s || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script";
  const curScript = () => state.scripts[state.current];

  // ---------- elements ----------
  const editor = $("editor");
  const editView = $("editView");
  const presentView = $("presentView");
  const stage = $("stage");
  const stageInner = $("stageInner");
  const inPresent = () => presentView.classList.contains("active");

  // ---------- apply settings to UI / DOM ----------
  function syncControls() {
    $("sizeSlider").value = state.size;  $("sizeVal").textContent = state.size + "px";
    $("speedSlider").value = state.speed; $("speedVal").textContent = state.speed;
    $("widthSlider").value = state.width; $("widthVal").textContent = state.width + "%";
    $("mirrorChk").checked = state.mirror;
    $("lineChk").checked = state.line;
    $("cdChk").checked = state.countdown;
    $("obsHost").value = state.obsHost;
    $("obsPass").value = state.obsPass;
  }

  function applyStageStyle() {
    document.documentElement.style.setProperty("--prompt-size", state.size + "px");
    const pad = (100 - state.width) / 2;
    stageInner.style.paddingLeft = pad + "%";
    stageInner.style.paddingRight = pad + "%";
    stage.classList.toggle("mirror", state.mirror);
    stage.classList.toggle("flipV", state.flipV);
    $("readingLine").classList.toggle("show", state.line);
    $("hudSpeed").textContent = state.speed;
  }

  // ---------- script management ----------
  function renderScriptBar() {
    const wrap = $("scriptChips");
    wrap.innerHTML = "";
    state.scripts.forEach((s, i) => {
      const chip = document.createElement("div");
      chip.className = "chip" + (i === state.current ? " active" : "");
      chip.dataset.i = i;
      const num = i < 9 ? (i + 1) : "·";
      chip.innerHTML = `<span class="num">${num}</span><span class="nm">${escapeHtml(s.name)}</span>` +
        (state.scripts.length > 1 ? `<span class="x" data-x="${i}" title="delete">×</span>` : "");
      wrap.appendChild(chip);
    });
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function updateScriptHud() {
    $("scriptLabel").textContent = (state.current + 1) + " · " + curScript().name;
  }

  function newScript() {
    const name = prompt("Name this script:", "Script " + (state.scripts.length + 1));
    if (name === null) return;
    if (!inPresent()) curScript().text = editor.value;
    state.scripts.push({ name: name.trim() || ("Script " + (state.scripts.length + 1)), text: "" });
    save();
    switchScript(state.scripts.length - 1);
    if (!inPresent()) editor.focus();
  }
  function renameScript(i) {
    const name = prompt("Rename script:", state.scripts[i].name);
    if (name === null) return;
    state.scripts[i].name = name.trim() || state.scripts[i].name;
    save(); renderScriptBar(); updateScriptHud();
  }
  function deleteScript(i) {
    if (state.scripts.length <= 1) { alert("Keep at least one script."); return; }
    if (!confirm(`Delete "${state.scripts[i].name}"?`)) return;
    state.scripts.splice(i, 1);
    if (state.current >= state.scripts.length) state.current = state.scripts.length - 1;
    else if (state.current > i) state.current--;
    save();
    if (!inPresent()) editor.value = curScript().text;
    renderScriptBar(); updateScriptHud(); renderStage();
  }

  // Switch active script. ALWAYS stops recording, rewinds to top, resets the take
  // counter — so you land ready to press R for a fresh recording.
  function switchScript(i) {
    if (i < 0 || i >= state.scripts.length) return;
    if (!inPresent()) curScript().text = editor.value;   // save edits before leaving
    cancelCountdown();
    pause();
    if (obsReady && obsRecording) obsRecord(false);       // stop any rolling recording
    inTake = false;
    state.current = i;
    take = 1; recordedAny = false;
    stage.scrollTop = 0; heldScroll = 0; elapsedMs = 0;
    if (inPresent()) {
      renderStage();
      $("playState").textContent = "Ready — Space: rehearse · R: record take";
      requestAnimationFrame(() => { stage.scrollTop = 0; updateTiming(); });
    } else {
      editor.value = curScript().text;
    }
    $("takeNum").textContent = take;
    applyStageStyle(); renderScriptBar(); updateScriptHud(); updateTiming();
    save();
  }

  // ---------- scrolling engine ----------
  let playing = false;
  let rafId = null;
  let lastT = 0;
  let scrollAccum = 0;
  let elapsedMs = 0;
  let take = 1;              // per-session take counter (not persisted)
  let recordedAny = false;   // has a take been started for the current script yet?
  let inTake = false;        // is the current scroll part of a recorded take (vs rehearsal)?
  let starting = false;      // mid take-start sequence (awaiting OBS / counting down)
  let cdTimer = null;        // countdown interval handle

  function fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function updateTiming() {
    $("hudElapsed").textContent = fmtTime(elapsedMs);
    const remainPx = Math.max(0, stage.scrollHeight - stage.clientHeight - stage.scrollTop);
    const remainMs = state.speed > 0 ? (remainPx / state.speed) * 1000 : 0;
    $("hudRemain").textContent = fmtTime(remainMs);
  }

  function stateLabel() {
    if (obsRecording) return playing ? "● Recording" : "● Recording (scroll paused)";
    if (inTake) return playing ? "▶ Rolling — NOT recording (OBS off)" : "Paused — NOT recording (OBS off)";
    return playing ? "Rehearsing (no recording)" : "Ready — Space: rehearse · R: record take";
  }

  function tick(t) {
    if (!playing) return;
    if (!lastT) lastT = t;
    const dt = (t - lastT) / 1000;
    lastT = t;
    elapsedMs += dt * 1000;
    scrollAccum += state.speed * dt;
    const whole = Math.floor(scrollAccum);
    if (whole > 0) { stage.scrollTop += whole; scrollAccum -= whole; }
    updateTiming();
    if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2) {
      pause();
      $("playState").textContent = obsRecording
        ? "✓ End (still recording) — R: new take · Esc: stop"
        : "✓ End — R: new take · Esc: edit";
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  // --- PROMPTER PLANE: Space + arrows. Pure scroll. Never touches OBS. ---
  function play() {
    if (playing) return;
    playing = true;
    starting = false;
    lastT = 0; scrollAccum = 0;
    if (stage.scrollTop < 4) { elapsedMs = 0; }
    $("playState").textContent = stateLabel();
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    $("playState").textContent = stateLabel();
  }
  function togglePlay() {                 // Space — rehearse / pause / resume; never records
    if (starting) return;
    if (playing) pause(); else play();
  }

  // --- TAKE PLANE: R / Backspace / Esc. Drives OBS, and the prompter with it. ---

  // R — Take / Retake: cut any rolling recording, rewind to top, auto-record if OBS
  // is connected (waiting until it's actually live), countdown, then roll.
  async function startTake() {
    if (starting) return;
    cancelCountdown();
    pause();
    starting = true;
    inTake = true;
    if (recordedAny) take++;
    recordedAny = true;
    $("takeNum").textContent = take;
    stage.scrollTop = 0; heldScroll = 0;
    elapsedMs = 0; updateTiming();
    if (obsReady) {
      $("playState").textContent = "● Starting recording…";
      // Retake: stop the live take, wait for the file to finalize (terminal STOPPED),
      // then let OBS release the output before starting a fresh one. Starting too soon
      // gets the request ACKed but silently dropped — OBS never actually rolls.
      if (obsRecording) { obsRecord(false); await waitForRecording(false, 4000); await sleep(400); }
      if (!starting) return;
      obsSetFilename(`${kebab(curScript().name)}-take${take}-%CCYY%MM%DD-%hh%mm%ss`);
      const live = await startRecordWithRetry(4);
      if (!starting) return;
      if (!live) $("playState").textContent = "(no OBS confirm — rolling anyway)";
    } else {
      $("playState").textContent = "▶ OBS not connected — rolling WITHOUT recording";
    }
    if (!starting) return;
    if (state.countdown) runCountdown(play);
    else play();
  }

  // Backspace — Cut: stop recording, freeze where you are (keeper / review).
  function cutTake() {
    cancelCountdown();
    pause();
    if (obsReady && obsRecording) obsRecord(false);
    inTake = false;
    $("playState").textContent = "Cut ✓ — R: new take · Esc: wrap";
  }

  function cancelCountdown() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    $("countdown").classList.remove("show");
    starting = false;
  }
  function runCountdown(then) {
    const cd = $("countdown"), num = $("cdNum");
    let n = 3;
    cd.classList.add("show"); num.textContent = n;
    cdTimer = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(cdTimer); cdTimer = null; cd.classList.remove("show"); then(); }
      else num.textContent = n;
    }, 800);
  }

  // ---------- mode switching ----------
  function renderStage() {
    stageInner.textContent = curScript().text || "(empty — go back and write your script)";
  }

  function enterPresent() {
    curScript().text = editor.value;
    save();
    renderStage();
    applyStageStyle();
    updateScriptHud();
    updateObsChip();
    editView.classList.add("hidden");
    presentView.classList.add("active");
    starting = false; inTake = false;
    $("takeNum").textContent = take;
    $("playState").textContent = "Ready — Space: rehearse · R: record take";
    requestAnimationFrame(() => { stage.scrollTop = heldScroll; updateTiming(); });
    armHudIdle();
  }

  let heldScroll = 0;
  function exitPresent() {                 // Esc — Wrap: stop recording, back to editor
    cancelCountdown();
    pause();
    heldScroll = stage.scrollTop;
    if (obsReady && obsRecording) obsRecord(false);
    obsRestoreFilename();                  // leave OBS naming as we found it
    inTake = false;
    editor.value = curScript().text;
    presentView.classList.remove("active");
    editView.classList.remove("hidden");
    renderScriptBar();
    editor.focus();
  }

  // ---------- HUD auto-dim ----------
  let idleTimer = null;
  function armHudIdle() {
    clearTimeout(idleTimer);
    $("hud").classList.remove("dim");
    idleTimer = setTimeout(() => { $("hud").classList.add("dim"); }, 3000);
  }

  // ---------- edit-view control wiring ----------
  $("sizeSlider").oninput  = e => { state.size = +e.target.value; $("sizeVal").textContent = state.size+"px"; applyStageStyle(); save(); };
  $("speedSlider").oninput = e => { state.speed = +e.target.value; $("speedVal").textContent = state.speed; $("hudSpeed").textContent = state.speed; updateTiming(); save(); };
  $("widthSlider").oninput = e => { state.width = +e.target.value; $("widthVal").textContent = state.width+"%"; applyStageStyle(); save(); };
  $("mirrorChk").onchange = e => { state.mirror = e.target.checked; applyStageStyle(); save(); };
  $("lineChk").onchange   = e => { state.line = e.target.checked; applyStageStyle(); save(); };
  $("cdChk").onchange     = e => { state.countdown = e.target.checked; save(); };
  $("presentBtn").onclick = enterPresent;
  $("newScriptBtn").onclick = newScript;
  editor.oninput = () => { curScript().text = editor.value; save(); };

  $("scriptChips").addEventListener("click", (e) => {
    const x = e.target.closest(".x");
    if (x) { deleteScript(+x.dataset.x); return; }
    const chip = e.target.closest(".chip");
    if (chip) switchScript(+chip.dataset.i);
  });
  $("scriptChips").addEventListener("dblclick", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) renameScript(+chip.dataset.i);
  });

  // ---------- present-view interactions ----------
  document.addEventListener("mousemove", () => { if (inPresent()) armHudIdle(); });
  stage.addEventListener("wheel", () => { if (inPresent()) { armHudIdle(); updateTiming(); } });
  stage.addEventListener("scroll", () => { if (inPresent() && !playing) updateTiming(); });
  $("hud").addEventListener("click", armHudIdle);

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    // ` toggles present <-> edit from anywhere (except the OBS text fields)
    if (e.key === "`") {
      if (e.target === $("obsHost") || e.target === $("obsPass")) return;
      e.preventDefault();
      if (inPresent()) exitPresent(); else enterPresent();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !inPresent()) {
      e.preventDefault(); enterPresent(); return;
    }
    if (!inPresent()) return;

    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); switchScript(+e.key - 1); return; }

    switch (e.key) {
      case " ": e.preventDefault(); togglePlay(); break;
      case "Escape": exitPresent(); break;
      case "r": case "R": startTake(); break;
      case "Backspace": e.preventDefault(); cutTake(); break;
      case "ArrowUp": e.preventDefault();
        if (e.shiftKey) stage.scrollTop -= 60;
        else { state.speed = Math.min(320, state.speed + 5); $("hudSpeed").textContent = state.speed; save(); }
        break;
      case "ArrowDown": e.preventDefault();
        if (e.shiftKey) stage.scrollTop += 60;
        else { state.speed = Math.max(10, state.speed - 5); $("hudSpeed").textContent = state.speed; save(); }
        break;
      case "ArrowLeft": e.preventDefault(); stage.scrollTop -= 120; break;
      case "ArrowRight": e.preventDefault(); stage.scrollTop += 120; break;
      case "+": case "=": state.size = Math.min(120, state.size + 4); applyStageStyle(); save(); break;
      case "-": case "_": state.size = Math.max(24, state.size - 4); applyStageStyle(); save(); break;
      case "m": case "M": state.mirror = !state.mirror; applyStageStyle(); save(); break;
      case "f": case "F": state.flipV = !state.flipV; applyStageStyle(); save(); break;
      case "Home": stage.scrollTop = 0; break;
      case "End": stage.scrollTop = stage.scrollHeight; break;
    }
    updateTiming();
    armHudIdle();
  });

  // =====================================================
  //  OBS WebSocket (v5)
  // =====================================================
  let obs = null, obsReady = false, obsRecording = false, recStart = 0, recTimer = null;
  let recWaiters = [];
  let obsOrigFmt = null;   // OBS's filename format before we touched it

  function waitForRecording(desired, timeoutMs) {
    return new Promise((resolve) => {
      if (obsRecording === desired) return resolve(true);
      const cb = (val) => { if (val === desired) finish(true); };
      const to = setTimeout(() => finish(false), timeoutMs);
      function finish(v) { clearTimeout(to); recWaiters = recWaiters.filter(x => x !== cb); resolve(v); }
      recWaiters.push(cb);
    });
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Issue StartRecord and wait for the STARTED event; OBS sometimes ACKs the
  // request right after a stop but never actually starts, so re-issue until it
  // takes (or we run out of attempts). Returns true once recording is live.
  async function startRecordWithRetry(attempts) {
    for (let i = 1; i <= attempts; i++) {
      if (!starting) return false;
      obsRecord(true);
      if (await waitForRecording(true, 1200)) return true;
      if (!starting) return false;
      $("playState").textContent = "● Starting recording… (retry " + i + ")";
      await sleep(400);
    }
    return obsRecording;
  }

  function setObsStatus(txt, cls) {
    $("obsStatus").innerHTML = '<span class="dot ' + (cls || "") + '" id="obsDot"></span>' + txt;
  }

  // present-mode always-on OBS indicator
  function updateObsChip() {
    const dot = $("obsChipDot"), lbl = $("obsChipLabel"), chip = $("obsChip");
    if (obsRecording) {
      const s = Math.floor((performance.now() - recStart) / 1000);
      dot.className = "dot rec"; chip.className = "pill rec-pill";
      lbl.textContent = "REC " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    } else if (obsReady) {
      dot.className = "dot on"; chip.className = "pill"; lbl.textContent = "OBS ready";
    } else {
      dot.className = "dot"; chip.className = "pill obs-off"; lbl.textContent = "OBS off";
    }
  }

  async function sha256b64(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function obsConnect() {
    state.obsHost = $("obsHost").value.trim() || "ws://localhost:4455";
    state.obsPass = $("obsPass").value;
    save();
    try { if (obs) obs.close(); } catch (e) {}
    obsReady = false; updateObsChip();
    setObsStatus("Connecting…");
    try { obs = new WebSocket(state.obsHost); }
    catch (e) { setObsStatus("Bad address"); return; }
    const password = state.obsPass;

    obs.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.op === 0) {
        const d = msg.d;
        const ident = { op: 1, d: { rpcVersion: 1 } };
        if (d.authentication) {
          const secret = await sha256b64(password + d.authentication.salt);
          ident.d.authentication = await sha256b64(secret + d.authentication.challenge);
        }
        obs.send(JSON.stringify(ident));
      } else if (msg.op === 2) {
        obsReady = true;
        state.obsAutoConnect = true; save();
        setObsStatus("Connected", "on");
        updateObsChip();
        obsSend("GetRecordStatus");
        obsSend("GetProfileParameter", { parameterCategory: "Output", parameterName: "FilenameFormatting" });
      } else if (msg.op === 7) {
        const r = msg.d;
        if (r.requestType === "GetRecordStatus" && r.responseData) {
          setRecording(!!r.responseData.outputActive);
        } else if (r.requestType === "GetProfileParameter" && r.responseData && obsOrigFmt === null) {
          obsOrigFmt = r.responseData.parameterValue || "%CCYY-%MM-%DD %hh-%mm-%ss";
        } else if (r.requestType === "StartRecord" && r.requestStatus && !r.requestStatus.result) {
          setObsStatus("OBS start failed: " + (r.requestStatus.comment || "see OBS"), "on");
        }
      } else if (msg.op === 5) {
        if (msg.d.eventType === "RecordStateChanged") {
          setRecording(!!msg.d.eventData.outputActive, msg.d.eventData.outputState);
        }
      }
    };
    obs.onerror = () => { setObsStatus("Connection failed"); updateObsChip(); };
    obs.onclose = () => {
      obsReady = false; updateObsChip();
      setObsStatus($("obsDot") && $("obsDot").classList.contains("on") ? "Disconnected" : "Not connected");
    };
  }

  function obsSend(requestType, requestData) {
    if (!obs || !obsReady) return;
    obs.send(JSON.stringify({ op: 6, d: { requestType, requestId: requestType + ":" + Date.now(), requestData: requestData || {} } }));
  }
  function obsRecord(on) { if (obsReady) obsSend(on ? "StartRecord" : "StopRecord"); }
  function obsSetFilename(fmt) {
    obsSend("SetProfileParameter", { parameterCategory: "Output", parameterName: "FilenameFormatting", parameterValue: fmt });
  }
  function obsRestoreFilename() {
    if (obsReady && obsOrigFmt !== null) obsSetFilename(obsOrigFmt);
  }

  function setRecording(on, outputState) {
    obsRecording = on;
    const terminal = !outputState
      || outputState === "OBS_WEBSOCKET_OUTPUT_STARTED"
      || outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED";
    if (terminal) recWaiters.slice().forEach(cb => cb(on));
    if (on) {
      recStart = performance.now();
      clearInterval(recTimer);
      recTimer = setInterval(updateObsChip, 500);
      setObsStatus("Recording", "rec");
    } else {
      clearInterval(recTimer);
      if (obsReady) setObsStatus("Connected", "on");
    }
    updateObsChip();
    if (inPresent()) $("playState").textContent = stateLabel();
  }

  $("obsToggleBtn").onclick = () => $("obsPanel").classList.toggle("open");
  $("obsConnectBtn").onclick = obsConnect;

  // ---------- init ----------
  load();
  take = 1;
  editor.value = curScript().text;
  syncControls();
  applyStageStyle();
  renderScriptBar();
  updateScriptHud();
  updateObsChip();
  editor.focus();
  if (state.obsAutoConnect && state.obsHost) obsConnect();   // reconnect automatically
})();
