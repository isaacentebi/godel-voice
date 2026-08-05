importScripts("core.js", "cdp.js", "download-receipts.js");

const GODEL_ORIGIN = "https://app.godelterminal.com";
const EXECUTOR_SEED_KEY = "godel-voice-executor-seed-v1";
const EXECUTOR_OWNERS_KEY = "godel-voice-executor-owners-v1";
const executorSeedReady = chrome.storage.local.get(EXECUTOR_SEED_KEY).then(async stored => {
  const existing = stored[EXECUTOR_SEED_KEY];
  if (typeof existing === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const seed = `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, "");
  await chrome.storage.local.set({ [EXECUTOR_SEED_KEY]: seed });
  return seed;
});
const executorOwnersReady = chrome.storage.session.get(EXECUTOR_OWNERS_KEY).then(stored => {
  const value = stored[EXECUTOR_OWNERS_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
});
const downloadReceipts = GodelVoiceDownloads.createDownloadReceiptManager();
const DOWNLOAD_RECEIPTS_KEY = "godel-voice-download-receipts-v1";
const downloadReceiptsReady = chrome.storage.local.get(DOWNLOAD_RECEIPTS_KEY).then(stored => {
  downloadReceipts.restore(stored[DOWNLOAD_RECEIPTS_KEY]);
});
const persistDownloadReceipts = () => chrome.storage.local.set({
  [DOWNLOAD_RECEIPTS_KEY]: downloadReceipts.snapshot().slice(-100)
});

chrome.downloads.onCreated.addListener(item => {
  downloadReceiptsReady.then(() => {
    const receipt = downloadReceipts.bindCreated(item);
    if (receipt) return persistDownloadReceipts();
  });
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  downloadReceiptsReady.then(() => {
    const proposal = downloadReceipts.overwriteSuggestion(item.id);
    if (proposal) suggest(proposal);
    else suggest();
  }, () => suggest());
  return true;
});

chrome.downloads.onChanged.addListener(async delta => {
  if (delta.state?.current !== "complete" && !delta.error?.current) return;
  await downloadReceiptsReady;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (item && downloadReceipts.complete(item)) await persistDownloadReceipts();
});

function assertGodelSender(sender) {
  const tab = sender.tab;
  if (!tab?.id || typeof tab.url !== "string") throw new Error("Missing sender tab");
  const url = new URL(tab.url);
  if (url.origin !== GODEL_ORIGIN) throw new Error("Refusing non-Godel tab");
  return tab;
}

async function executorIdentity(sender) {
  const tab = assertGodelSender(sender);
  // Chrome's documentId is immutable for one document generation and changes
  // on every navigation/reload. Hash it with a background-only seed so page
  // scripts receive an opaque capability, never a reusable tab identifier.
  const documentId = String(sender.documentId ?? "");
  if (!documentId) throw new Error("Missing sender document generation");
  const owners = await executorOwnersReady;
  const tabKey = String(tab.id);
  if (!/^gx-[A-Za-z0-9_-]{40,96}$/.test(String(owners[tabKey] ?? ""))) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    owners[tabKey] = `gx-${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
    await chrome.storage.session.set({ [EXECUTOR_OWNERS_KEY]: owners });
  }
  const seed = await executorSeedReady;
  const bytes = new TextEncoder().encode(`${seed}\u0000${tab.id}\u0000${documentId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const token = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { executor_id: owners[tabKey], document_generation: `gd-${token}` };
}

chrome.tabs.onRemoved.addListener(tabId => {
  executorOwnersReady.then(owners => {
    if (!Object.hasOwn(owners, String(tabId))) return;
    delete owners[String(tabId)];
    return chrome.storage.session.set({ [EXECUTOR_OWNERS_KEY]: owners });
  }).catch(() => {});
});

async function withDebugger(tabId, callback) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    return await callback(target);
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function sendBatch(tabId, commands) {
  return withDebugger(tabId, async target => {
    for (const [method, params] of commands) {
      await chrome.debugger.sendCommand(target, method, params);
    }
  });
}

async function focusExactEditable(target, selector) {
  await chrome.debugger.sendCommand(target, "DOM.enable");
  // DOM.requestNode only returns a usable node id after the document has been
  // requested by this debugger session.
  await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: 0 });
  const evaluated = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
    expression: GodelVoiceCDP.exactEditableExpression(selector),
    objectGroup: "godel-voice",
    returnByValue: false
  });
  if (evaluated.exceptionDetails) {
    const description = evaluated.exceptionDetails.exception?.description
      || evaluated.exceptionDetails.text
      || "Could not resolve nested Godel input";
    throw new Error(description);
  }
  const objectId = evaluated.result?.objectId;
  if (!objectId) throw new Error("Nested Godel target did not resolve to a DOM node");
  try {
    const { nodeId } = await chrome.debugger.sendCommand(target, "DOM.requestNode", { objectId });
    if (!nodeId) throw new Error("Nested Godel target has no DOM node id");
    await chrome.debugger.sendCommand(target, "DOM.focus", { nodeId });
    const focused = await chrome.debugger.sendCommand(target, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: "function () { this.focus({ preventScroll: true }); return document.activeElement === this; }",
      returnByValue: true
    });
    if (focused.result?.value !== true) throw new Error("Nested Godel input refused focus");
  } finally {
    await chrome.debugger.sendCommand(target, "Runtime.releaseObject", { objectId }).catch(() => {});
  }
}

async function trustedReplaceAndSubmit(tabId, selector, text, submit) {
  return withDebugger(tabId, async target => {
    await focusExactEditable(target, selector);
    for (const [method, params] of GodelVoiceCDP.trustedReplaceAndSubmitCommands(text, submit)) {
      await chrome.debugger.sendCommand(target, method, params);
    }
  });
}

async function focusAndInsert(tabId, selector, text) {
  return withDebugger(tabId, async target => {
    await focusExactEditable(target, selector);
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: String(text) });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type?.startsWith("godel-voice:")) return false;
  (async () => {
    const tab = assertGodelSender(sender);
    const tabId = tab.id;
    if (message.type === "godel-voice:executor-identity") {
      return { ok: true, ...await executorIdentity(sender) };
    }
    if (message.type === "godel-voice:executor-eligibility") {
      const focusedWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      const identity = await executorIdentity(sender);
      return {
        ok: true,
        eligible: tab.active === true && focusedWindow?.id === tab.windowId,
        ...identity
      };
    }
    if (message.type === "godel-voice:inject-main") {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["adapters/imap.js", "main-world.js"],
        world: "MAIN",
        injectImmediately: true
      });
      return { ok: true };
    }
    if (message.type === "godel-voice:download-register") {
      await downloadReceiptsReady;
      const receipt = downloadReceipts.register({
        ...message.registration,
        tab_id: tabId,
        source_origin: GODEL_ORIGIN
      });
      await persistDownloadReceipts();
      return { ok: true, receipt };
    }
    if (message.type === "godel-voice:download-status") {
      await downloadReceiptsReady;
      return { ok: true, receipt: downloadReceipts.get(message.receipt_id) };
    }
    if (message.type !== "godel-voice:cdp") throw new Error("Unsupported Godel Voice message");
    if (message.operation === "trustedReplaceAndSubmit") {
      await trustedReplaceAndSubmit(tabId, message.selector, message.text, message.submit !== false);
      return { ok: true };
    }
    if (message.operation === "focusAndInsert") {
      await focusAndInsert(tabId, message.selector, message.text);
      return { ok: true };
    }
    let commands;
    if (message.operation === "click") commands = GodelVoiceCDP.clickCommands(message.rect);
    else if (message.operation === "key") commands = GodelVoiceCDP.keyCommands(message.key);
    else if (message.operation === "trustedType") commands = GodelVoiceCDP.trustedTypeCommands(message.text);
    else if (message.operation === "replaceText") commands = GodelVoiceCDP.replaceTextCommands(message.rect, message.text);
    else if (message.operation === "insertText") commands = GodelVoiceCDP.insertTextCommands(message.rect, message.text);
    else throw new Error(`Unsupported browser operation: ${message.operation}`);
    await sendBatch(tabId, commands);
    return { ok: true };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
