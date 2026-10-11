"use strict";
(() => {
  // lib/runner/types.ts
  var RunnerError = class extends Error {
    constructor(code, message, nodeId, details) {
      super(`[${code}] ${message}`);
      this.code = code;
      this.nodeId = nodeId;
      this.details = details;
      this.name = "RunnerError";
    }
  };

  // lib/runner-dom/handleStore.ts
  var ElementHandleStore = class {
    constructor() {
      this.handles = /* @__PURE__ */ new Map();
      this.elementToId = /* @__PURE__ */ new WeakMap();
      this.counter = 0;
    }
    getOrCreateHandle(element) {
      const existing = this.elementToId.get(element);
      if (existing && this.handles.has(existing)) {
        return existing;
      }
      this.counter++;
      const id = `el-handle-${this.counter}`;
      this.handles.set(id, element);
      this.elementToId.set(element, id);
      return id;
    }
    getElement(id) {
      return this.handles.get(id);
    }
    clear() {
      this.handles.clear();
      this.counter = 0;
    }
  };

  // lib/runner/text.ts
  function normalizeText(text) {
    if (typeof text !== "string") return "";
    return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, " ").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function matchText(actual, expected, mode = "normalized") {
    if (typeof actual !== "string" || typeof expected !== "string") {
      return false;
    }
    if (mode === "exact") {
      return actual === expected;
    }
    const normActual = normalizeText(actual);
    const normExpected = normalizeText(expected);
    if (mode === "contains") {
      return normActual.includes(normExpected);
    }
    return normActual === normExpected;
  }
  function findHeaderMatch(headers, candidates, mode = "normalized") {
    for (const cand of candidates) {
      for (let i = 0; i < headers.length; i++) {
        if (matchText(headers[i], cand, mode)) {
          return i;
        }
      }
    }
    return -1;
  }

  // lib/runner-dom/selectors.ts
  function queryAllInShadowAndFrames(root, selector) {
    const elements = [];
    try {
      elements.push(...Array.from(root.querySelectorAll(selector)));
    } catch {
    }
    const allNodes = Array.from(root.querySelectorAll("*"));
    for (const el of allNodes) {
      if (el.shadowRoot) {
        elements.push(...queryAllInShadowAndFrames(el.shadowRoot, selector));
      }
      if (el.tagName.toLowerCase() === "iframe") {
        try {
          const iframeDoc = el.contentDocument;
          if (iframeDoc) {
            elements.push(...queryAllInShadowAndFrames(iframeDoc, selector));
          }
        } catch {
        }
      }
    }
    return elements;
  }
  function getElementText(el) {
    if (el.tagName.toLowerCase() === "input" || el.tagName.toLowerCase() === "textarea") {
      return el.value || "";
    }
    return el.innerText || el.textContent || "";
  }
  function getElementLabel(el, doc) {
    if (el.id) {
      const lbl = doc.querySelector(`label[for="${el.id}"]`);
      if (lbl) return lbl.textContent?.trim() || "";
    }
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent?.trim() || "";
    return el.getAttribute("aria-label") || el.getAttribute("title") || "";
  }
  function matchCandidate(cand, root) {
    const doc = root.ownerDocument || root;
    switch (cand.strategy) {
      case "css": {
        return queryAllInShadowAndFrames(root, cand.selector);
      }
      case "test_id": {
        const all = queryAllInShadowAndFrames(root, "[data-testid], [data-test-id], [data-id]");
        return all.filter((el) => {
          const tid = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-id") || "";
          return matchText(tid, cand.test_id, cand.match ?? "exact");
        });
      }
      case "placeholder": {
        const all = queryAllInShadowAndFrames(root, "input[placeholder], textarea[placeholder]");
        return all.filter((el) => {
          const ph = el.getAttribute("placeholder") || "";
          return matchText(ph, cand.placeholder, cand.match ?? "normalized");
        });
      }
      case "aria_label": {
        const all = queryAllInShadowAndFrames(root, "[aria-label], [title]");
        return all.filter((el) => {
          const al = el.getAttribute("aria-label") || el.getAttribute("title") || "";
          return matchText(al, cand.aria_label, cand.match ?? "normalized");
        });
      }
      case "label_text": {
        const allInputs = queryAllInShadowAndFrames(root, 'input, select, textarea, button, [role="checkbox"], [role="combobox"]');
        return allInputs.filter((el) => {
          const label = getElementLabel(el, doc);
          return matchText(label, cand.label, cand.match ?? "normalized");
        });
      }
      case "role_name": {
        const roleMap = {
          button: 'button, input[type="button"], input[type="submit"], [role="button"]',
          checkbox: 'input[type="checkbox"], [role="checkbox"]',
          textbox: 'input[type="text"], input[type="number"], textarea, [role="textbox"]',
          combobox: 'select, [role="combobox"]',
          table: 'table, [role="table"], [role="grid"]',
          row: 'tr, [role="row"]'
        };
        const sel = roleMap[cand.role.toLowerCase()] || `[role="${cand.role}"]`;
        const all = queryAllInShadowAndFrames(root, sel);
        return all.filter((el) => {
          const accessibleName = getElementLabel(el, doc) || getElementText(el);
          return matchText(accessibleName, cand.name, cand.match ?? "normalized");
        });
      }
      case "text": {
        const all = queryAllInShadowAndFrames(root, "*");
        return all.filter((el) => {
          if (el.children.length > 0 && Array.from(el.children).some((child) => child.innerText?.trim())) {
            return false;
          }
          const txt = el.innerText || el.textContent || "";
          const mode = cand.exact ? "exact" : cand.match ?? "normalized";
          return matchText(txt, cand.text, mode);
        });
      }
      case "column_header": {
        const allHeaders = queryAllInShadowAndFrames(root, 'th, [role="columnheader"]');
        return allHeaders.filter((el) => {
          const txt = el.innerText || el.textContent || "";
          return matchText(txt, cand.column_label, cand.match ?? "normalized");
        });
      }
      case "structural_relative": {
        const { elements: targets } = resolveAnchorElements(cand.to, root);
        const results = [];
        for (const base of targets) {
          if (cand.relation === "parent" && base.parentElement) results.push(base.parentElement);
          if (cand.relation === "next_sibling" && base.nextElementSibling) results.push(base.nextElementSibling);
          if (cand.relation === "prev_sibling" && base.previousElementSibling) results.push(base.previousElementSibling);
          if (cand.relation === "first_child" && base.firstElementChild) results.push(base.firstElementChild);
        }
        return results;
      }
      default:
        return [];
    }
  }
  function resolveAnchorElements(anchor, root) {
    for (let i = 0; i < anchor.candidates.length; i++) {
      const cand = anchor.candidates[i];
      const matched = matchCandidate(cand, root);
      if (matched.length > 0) {
        return { elements: matched, matchedCandidateIndex: i };
      }
    }
    return { elements: [], matchedCandidateIndex: -1 };
  }

  // lib/runner/nodes/loop.ts
  function shouldSkipRow(row, skipRows, skipEmptyRows = true) {
    if (skipEmptyRows) {
      const nonBlank = Object.values(row).map((v) => (v || "").trim()).filter(Boolean);
      if (nonBlank.length === 0) return true;
    }
    if (!skipRows || skipRows.length === 0) return false;
    for (const rule of skipRows) {
      for (const [colName, val] of Object.entries(row)) {
        if (findHeaderMatch([colName], rule.column_labels, rule.match) >= 0) {
          for (const targetVal of rule.values) {
            if (matchText(val, targetVal, rule.match)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // lib/runner-dom/tableReader.ts
  function parseTableHeaders(table) {
    const theadRows = Array.from(table.querySelectorAll("thead tr"));
    const headerRows = theadRows.length > 0 ? theadRows : Array.from(table.querySelectorAll("tr")).filter((r) => r.querySelector("th"));
    if (headerRows.length === 0) {
      const firstTr = table.querySelector("tr");
      if (firstTr) {
        return Array.from(firstTr.children).map((c, i) => c.innerText?.trim() || `Coluna ${i + 1}`);
      }
      return [];
    }
    if (headerRows.length === 1) {
      const ths = Array.from(headerRows[0].querySelectorAll("th, td"));
      const headers2 = [];
      for (const th of ths) {
        const span = parseInt(th.getAttribute("colspan") || "1", 10) || 1;
        const text = th.innerText?.trim() || "";
        for (let s = 0; s < span; s++) {
          headers2.push(text);
        }
      }
      return headers2;
    }
    const topThs = Array.from(headerRows[0].querySelectorAll("th, td"));
    const subThs = Array.from(headerRows[1].querySelectorAll("th, td"));
    const headers = [];
    let subIdx = 0;
    for (const top of topThs) {
      const topText = top.innerText?.trim() || "";
      const span = parseInt(top.getAttribute("colspan") || "1", 10) || 1;
      const rowSpan = parseInt(top.getAttribute("rowspan") || "1", 10) || 1;
      if (rowSpan > 1 || span === 1) {
        headers.push(topText);
      } else {
        for (let s = 0; s < span; s++) {
          const sub = subThs[subIdx++];
          const subText = sub ? sub.innerText?.trim() || "" : "";
          headers.push(subText ? `${topText} ${subText}`.trim() : topText);
        }
      }
    }
    return headers;
  }
  function readHtmlTable(tableEl, options) {
    const headers = parseTableHeaders(tableEl);
    const rows = [];
    const rawCells = [];
    let trs = Array.from(tableEl.querySelectorAll("tbody tr"));
    if (trs.length === 0) {
      trs = Array.from(tableEl.querySelectorAll("tr")).filter((r) => !r.querySelector("th"));
    }
    if (trs.length === 0 && tableEl.classList.contains("cards-container")) {
      const cards = Array.from(tableEl.querySelectorAll('.aluno-box, .student-card, [role="row"]'));
      for (const card of cards) {
        const record = {};
        const title = card.querySelector(".student-title, h3, h4")?.textContent?.trim() || "";
        const input = card.querySelector("input, select");
        record["Nome do Aluno"] = title;
        record["Nota"] = input?.value || "";
        rows.push(record);
      }
      return { headers: ["Nome do Aluno", "Nota"], rows, rawCells: [] };
    }
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll("td, th"));
      if (cells.length === 0) continue;
      const rowObj = {};
      const cellValues = [];
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const input = cell.querySelector("input, select, textarea");
        let val = "";
        if (input) {
          if (input.type === "checkbox") {
            val = input.checked ? "true" : "false";
          } else {
            val = input.value || "";
          }
        } else {
          val = cell.innerText?.trim() || cell.textContent?.trim() || "";
        }
        cellValues.push(val);
        const headerKey = headers[c] || `Coluna_${c + 1}`;
        rowObj[headerKey] = val;
      }
      rawCells.push(cellValues);
      if (!shouldSkipRow(rowObj, options.skip_rows, options.skip_empty_rows)) {
        rows.push(rowObj);
      }
    }
    return { headers, rows, rawCells };
  }

  // lib/runner-dom/writer.ts
  function executeDomWrite(element, options) {
    let beforeValue = "";
    let afterValue = "";
    let isVerified = false;
    const tag = element.tagName.toLowerCase();
    const isCheckbox = element.type === "checkbox" || element.getAttribute("role") === "checkbox";
    if (isCheckbox || options.method === "set_checked") {
      const input = element;
      beforeValue = input.checked ? "true" : "false";
      let targetChecked = true;
      if (options.polarity === "presence") {
        targetChecked = options.value === "true" || options.value === "1";
      } else if (options.polarity === "absence") {
        targetChecked = options.value === "true" || options.value === "1";
      } else {
        targetChecked = options.value === "true" || options.value === "1";
      }
      if (input.checked !== targetChecked) {
        input.checked = targetChecked;
        input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
        try {
          input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        } catch {
        }
      }
      try {
        input.focus();
      } catch {
      }
      afterValue = input.checked ? "true" : "false";
      isVerified = input.checked === targetChecked;
      return { success: isVerified, beforeValue, afterValue, verified: isVerified };
    }
    if (tag === "select" || options.method === "select_option") {
      const select = element;
      beforeValue = select.options[select.selectedIndex]?.value || select.value || "";
      const normTarget = normalizeText(options.value);
      const opt = Array.from(select.options).find(
        (o) => normalizeText(o.value) === normTarget || normalizeText(o.text).includes(normTarget)
      );
      if (opt) {
        select.value = opt.value;
      } else {
        select.value = options.value;
      }
      select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      afterValue = select.options[select.selectedIndex]?.value || select.value || "";
      isVerified = opt ? select.value === opt.value : afterValue === options.value;
      return { success: isVerified, beforeValue, afterValue, verified: isVerified };
    }
    const inputEl = element;
    beforeValue = inputEl.value !== void 0 ? String(inputEl.value) : element.textContent || "";
    let setterFound = false;
    try {
      const proto = Object.getPrototypeOf(inputEl);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value") || typeof HTMLInputElement !== "undefined" && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") || typeof HTMLTextAreaElement !== "undefined" && Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(inputEl, options.value);
        setterFound = true;
      }
    } catch {
    }
    if (!setterFound) {
      inputEl.value = options.value;
      if (inputEl.isContentEditable) {
        inputEl.innerText = options.value;
      }
    }
    try {
      inputEl.focus();
    } catch {
    }
    inputEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    try {
      inputEl.blur();
    } catch {
    }
    afterValue = inputEl.value !== void 0 ? String(inputEl.value) : element.textContent || "";
    isVerified = afterValue === options.value;
    return { success: isVerified, beforeValue, afterValue, verified: isVerified };
  }

  // lib/runner-dom/conditions.ts
  function evaluateDomCondition(cond, doc) {
    if (cond.op === "all") {
      for (const c of cond.conditions) {
        const res = evaluateDomCondition(c, doc);
        if (!res.satisfied) return { satisfied: false };
      }
      return { satisfied: true };
    }
    if (cond.op === "any") {
      for (const c of cond.conditions) {
        const res = evaluateDomCondition(c, doc);
        if (res.satisfied) return { satisfied: true };
      }
      return { satisfied: false };
    }
    if (cond.op === "not") {
      const res = evaluateDomCondition(cond.condition, doc);
      return { satisfied: !res.satisfied };
    }
    switch (cond.op) {
      case "exists": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        return { satisfied: elements.length > 0 };
      }
      case "not_exists": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        return { satisfied: elements.length === 0 };
      }
      case "visible": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const el = elements[0];
        const isVis = el.offsetParent !== null && !el.hasAttribute("hidden") && el.style.display !== "none";
        return { satisfied: isVis };
      }
      case "enabled": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const el = elements[0];
        return { satisfied: !el.hasAttribute("disabled") };
      }
      case "count_gte": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        return { satisfied: elements.length >= cond.n };
      }
      case "text_equals": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const txt = getElementText(elements[0]);
        return { satisfied: matchText(txt, cond.expected, "exact") };
      }
      case "text_contains": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const txt = getElementText(elements[0]);
        return { satisfied: matchText(txt, cond.expected, "contains") };
      }
      case "text_matches": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const txt = getElementText(elements[0]);
        const regex = new RegExp(cond.pattern);
        return { satisfied: regex.test(txt) };
      }
      case "value_equals": {
        const { elements } = resolveAnchorElements(cond.anchor, doc);
        if (elements.length === 0) return { satisfied: false };
        const val = elements[0].value ?? "";
        return { satisfied: matchText(val, cond.expected, "exact") };
      }
      case "url_matches": {
        const url = doc.location?.href || "";
        const regex = new RegExp(cond.pattern);
        return { satisfied: regex.test(url) };
      }
      default:
        return { satisfied: true };
    }
  }

  // lib/runner-dom/driver.ts
  var DomDriver = class {
    constructor(doc, allowedHosts) {
      this.doc = doc;
      this.allowedHosts = allowedHosts;
      this.handleStore = new ElementHandleStore();
    }
    hostGuard() {
      const currentHost = this.doc.location?.hostname || "localhost";
      const isAllowed = this.allowedHosts.some((allowed) => {
        const normAllowed = allowed.toLowerCase().trim();
        return currentHost === normAllowed || currentHost.endsWith(`.${normAllowed}`);
      });
      if (!isAllowed) {
        throw new RunnerError(
          "E_HOST_NOT_ALLOWED",
          `Host '${currentHost}' n\xE3o autorizado para execu\xE7\xE3o do DomDriver (permitidos: ${this.allowedHosts.join(", ")})`
        );
      }
    }
    resolveTargetElement(target) {
      if ("handleId" in target) {
        const el = this.handleStore.getElement(target.handleId);
        if (!el) throw new RunnerError("E_ANCHOR_NOT_FOUND", `Handle de elemento '${target.handleId}' expirou ou \xE9 inv\xE1lido`);
        return el;
      }
      const { elements } = resolveAnchorElements(target.anchor, this.doc);
      if (elements.length === 0) throw new RunnerError("E_ANCHOR_NOT_FOUND", `Elemento '${target.anchor.description}' n\xE3o localizado`);
      return elements[0];
    }
    async locateAnchor(resolvedAnchor) {
      this.hostGuard();
      const { elements, matchedCandidateIndex } = resolveAnchorElements(resolvedAnchor, this.doc);
      const handleId = elements[0] ? this.handleStore.getOrCreateHandle(elements[0]) : void 0;
      return { matchCount: elements.length, matchedCandidateIndex, handleId };
    }
    async locateRow(scope) {
      this.hostGuard();
      const tableEl = this.resolveTargetElement({ anchor: scope.table });
      const headers = parseTableHeaders(tableEl);
      const keyIndex = findHeaderMatch(headers, scope.key.column_labels, scope.key.match);
      if (keyIndex === -1) {
        return { matchedIndex: -1, totalCandidates: 0, ambiguous: false };
      }
      const trs = Array.from(tableEl.querySelectorAll("tbody tr, tr")).filter((r) => !r.querySelector("th"));
      const matchingRows = [];
      for (const tr of trs) {
        const cells = Array.from(tr.querySelectorAll("td, th"));
        if (cells[keyIndex]) {
          const txt = cells[keyIndex].innerText?.trim() || "";
          if (matchText(txt, String(scope.key.equals), scope.key.match)) {
            matchingRows.push(tr);
          }
        }
      }
      if (matchingRows.length > 1 && scope.key.secondary_key) {
        const secKey = scope.key.secondary_key;
        const secIndex = findHeaderMatch(headers, secKey.column_labels, secKey.match);
        if (secIndex >= 0) {
          const filtered = matchingRows.filter((tr) => {
            const cells = Array.from(tr.querySelectorAll("td, th"));
            const val = cells[secIndex]?.innerText?.trim() || "";
            return matchText(val, String(secKey.equals), secKey.match);
          });
          if (filtered.length === 1) {
            const rowHandleId = this.handleStore.getOrCreateHandle(filtered[0]);
            return { rowHandleId, matchedIndex: trs.indexOf(filtered[0]), totalCandidates: 1, ambiguous: false };
          }
        }
      }
      if (matchingRows.length > 1) {
        return { matchedIndex: 0, totalCandidates: matchingRows.length, ambiguous: true };
      }
      if (matchingRows.length === 1) {
        const rowHandleId = this.handleStore.getOrCreateHandle(matchingRows[0]);
        return { rowHandleId, matchedIndex: trs.indexOf(matchingRows[0]), totalCandidates: 1, ambiguous: false };
      }
      return { matchedIndex: -1, totalCandidates: 0, ambiguous: false };
    }
    async readTable(options) {
      this.hostGuard();
      const tableEl = this.resolveTargetElement({ anchor: options.anchor });
      return readHtmlTable(tableEl, options);
    }
    async readText(target) {
      this.hostGuard();
      const el = this.resolveTargetElement(target);
      return { text: getElementText(el) };
    }
    async readValue(target) {
      this.hostGuard();
      const el = this.resolveTargetElement(target);
      const isChecked = el.type === "checkbox" ? el.checked : void 0;
      return { value: el.value || "", checked: isChecked };
    }
    async write(options) {
      this.hostGuard();
      const el = this.resolveTargetElement(options.target);
      return executeDomWrite(el, options);
    }
    async click(target, options) {
      this.hostGuard();
      const el = this.resolveTargetElement(target);
      el.click();
      return { success: true };
    }
    async evaluateCondition(cond) {
      this.hostGuard();
      return evaluateDomCondition(cond, this.doc);
    }
    async scroll(options) {
      this.hostGuard();
      if (options.mode === "scroll_until_found" && options.target) {
        try {
          const el = this.resolveTargetElement(options.target);
          el.scrollIntoView({ behavior: "instant", block: "center" });
          return { found: true };
        } catch {
          return { found: false };
        }
      }
      if (options.mode === "virtual_scroll") {
        const container = options.container ? this.resolveTargetElement(options.container) : this.doc.documentElement;
        container.scrollTop += options.maxDistancePx || 150;
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
        return { found: true };
      }
      return { found: true };
    }
    async paginate(options) {
      this.hostGuard();
      if (options.buttonTarget) {
        const btn = this.resolveTargetElement(options.buttonTarget);
        const isDisabled = btn.hasAttribute("disabled") || btn.disabled;
        if (isDisabled) return { advanced: false, isLastPage: true };
        btn.click();
        return { advanced: true, isLastPage: false };
      }
      const defaultNextBtn = this.doc.querySelector('.btn-proxima-pagina, button.next-page, button:has-text("Pr\xF3xima")');
      if (defaultNextBtn) {
        const isDisabled = defaultNextBtn.hasAttribute("disabled") || defaultNextBtn.disabled;
        if (isDisabled) return { advanced: false, isLastPage: true };
        defaultNextBtn.click();
        return { advanced: true, isLastPage: false };
      }
      return { advanced: false, isLastPage: true };
    }
    async getFrameContext() {
      this.hostGuard();
      return {
        url: this.doc.location?.href || "about:blank",
        host: this.doc.location?.hostname || "localhost",
        frameId: 0
      };
    }
    async matchFingerprint(fp) {
      this.hostGuard();
      const path = this.doc.location?.pathname || "/";
      const pathMatched = new RegExp(fp.route.path_pattern).test(path);
      return { matched: pathMatched, details: { path: pathMatched } };
    }
    async listFrames() {
      this.hostGuard();
      return [{ frameId: 0, url: this.doc.location?.href || "", host: this.doc.location?.hostname || "" }];
    }
  };

  // lib/runner-ext/protocol.ts
  var SKILLGRAPH_RPC_CHANNEL = "SKILLGRAPH_DRIVER_RPC";
  function isDriverRpcRequest(msg) {
    return Boolean(msg && msg.channel === SKILLGRAPH_RPC_CHANNEL && typeof msg.id === "string" && typeof msg.method === "string");
  }

  // lib/runner-ext/contentAdapter.ts
  var ContentAdapter = class {
    constructor(options = {}) {
      this.doc = options.doc || (typeof document !== "undefined" ? document : null);
      const hosts = options.allowedHosts || ["localhost", "127.0.0.1", "*"];
      this.driver = new DomDriver(this.doc, hosts);
    }
    async handleRequest(request) {
      const { id, method, params } = request;
      try {
        if (method === "getFrameContext") {
          const url = this.doc.location?.href || "";
          const host = this.doc.location?.hostname || "";
          return {
            channel: SKILLGRAPH_RPC_CHANNEL,
            id,
            ok: true,
            result: { url, host, frameId: 0 }
          };
        }
        if (method === "listFrames") {
          const frames = Array.from(this.doc.querySelectorAll("iframe")).map((f, idx) => ({
            frameId: idx + 1,
            url: f.src || "",
            host: f.src ? new URL(f.src, this.doc.location?.href).hostname : ""
          }));
          frames.unshift({
            frameId: 0,
            url: this.doc.location?.href || "",
            host: this.doc.location?.hostname || ""
          });
          return {
            channel: SKILLGRAPH_RPC_CHANNEL,
            id,
            ok: true,
            result: frames
          };
        }
        const driverAny = this.driver;
        if (typeof driverAny[method] !== "function") {
          return {
            channel: SKILLGRAPH_RPC_CHANNEL,
            id,
            ok: false,
            error: `M\xE9todo do driver desconhecido: ${method}`,
            code: "E_NODE_UNSUPPORTED"
          };
        }
        let result;
        if (method === "click") {
          result = await this.driver.click(params.target, params.options);
        } else {
          result = await driverAny[method](params);
        }
        return {
          channel: SKILLGRAPH_RPC_CHANNEL,
          id,
          ok: true,
          result
        };
      } catch (err) {
        return {
          channel: SKILLGRAPH_RPC_CHANNEL,
          id,
          ok: false,
          error: err.message || "Erro ao executar primitiva no DomDriver",
          code: err.code || "E_TIMEOUT"
        };
      }
    }
  };
  var activeAdapter = null;
  function initContentAdapter(options = {}) {
    if (activeAdapter) return activeAdapter;
    activeAdapter = new ContentAdapter(options);
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!isDriverRpcRequest(message)) {
          return false;
        }
        activeAdapter.handleRequest(message).then(sendResponse);
        return true;
      });
    }
    return activeAdapter;
  }

  // lib/runner-ext/contentEntry.ts
  initContentAdapter();
})();
//# sourceMappingURL=content-adapter.bundle.js.map
