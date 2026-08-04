importScripts("core.js", "cdp.js", "download-receipts.js");

const GODEL_ORIGIN = "https://app.godelterminal.com";
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

async function sendBatch(tabId, commands) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    for (const [method, params] of commands) {
      await chrome.debugger.sendCommand(target, method, params);
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
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
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await focusExactEditable(target, selector);
    for (const [method, params] of GodelVoiceCDP.trustedReplaceAndSubmitCommands(text, submit)) {
      await chrome.debugger.sendCommand(target, method, params);
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function focusAndInsert(tabId, selector, text) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await focusExactEditable(target, selector);
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: String(text) });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type?.startsWith("godel-voice:")) return false;
  (async () => {
    const tab = assertGodelSender(sender);
    const tabId = tab.id;
    if (message.type === "godel-voice:executor-eligibility") {
      const focusedWindow = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      return { ok: true, eligible: tab.active === true && focusedWindow?.id === tab.windowId };
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
