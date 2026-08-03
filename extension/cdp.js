(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceCDP = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KEYS = {
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
    Backquote: { key: "`", code: "Backquote", windowsVirtualKeyCode: 192, text: "`", unmodifiedText: "`" }
  };

  function clickCommands(rect) {
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    return [
      ["Input.dispatchMouseEvent", { type: "mouseMoved", x, y }],
      ["Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 }],
      ["Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 }]
    ];
  }

  function keyCommands(name) {
    const key = KEYS[name];
    if (!key) throw new Error(`Unsupported CDP key: ${name}`);
    return [
      ["Input.dispatchKeyEvent", { type: "keyDown", ...key }],
      ["Input.dispatchKeyEvent", { type: "keyUp", key: key.key, code: key.code, windowsVirtualKeyCode: key.windowsVirtualKeyCode }]
    ];
  }

  function replaceTextCommands(rect, text) {
    return [
      ...clickCommands(rect),
      ["Input.dispatchKeyEvent", {
        type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65,
        modifiers: 4, commands: ["selectAll"]
      }],
      ["Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 4 }],
      ...keyCommands("Backspace"),
      ["Input.insertText", { text: String(text) }]
    ];
  }

  return { clickCommands, keyCommands, replaceTextCommands };
});
