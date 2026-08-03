importScripts("core.js", "cdp.js");

const GODEL_ORIGIN = "https://app.godelterminal.com";

function assertGodelSender(sender) {
  const tab = sender.tab;
  if (!tab?.id || typeof tab.url !== "string") throw new Error("Missing sender tab");
  const url = new URL(tab.url);
  if (url.origin !== GODEL_ORIGIN) throw new Error("Refusing non-Godel tab");
  return tab.id;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "godel-voice:cdp") return false;
  (async () => {
    const tabId = assertGodelSender(sender);
    let commands;
    if (message.operation === "click") commands = GodelVoiceCDP.clickCommands(message.rect);
    else if (message.operation === "key") commands = GodelVoiceCDP.keyCommands(message.key);
    else if (message.operation === "replaceText") commands = GodelVoiceCDP.replaceTextCommands(message.rect, message.text);
    else throw new Error(`Unsupported browser operation: ${message.operation}`);
    await sendBatch(tabId, commands);
    return { ok: true };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
