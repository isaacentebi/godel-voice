(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceCDP = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const KEYS = {
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
    Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
    Backquote: { key: "`", code: "Backquote", windowsVirtualKeyCode: 192, text: "`", unmodifiedText: "`" }
  };

  const PRINTABLE_KEYS = {
    " ": { key: " ", code: "Space", windowsVirtualKeyCode: 32 },
    ".": { key: ".", code: "Period", windowsVirtualKeyCode: 190 },
    "-": { key: "-", code: "Minus", windowsVirtualKeyCode: 189 },
    "/": { key: "/", code: "Slash", windowsVirtualKeyCode: 191 },
    "_": { key: "_", code: "Minus", windowsVirtualKeyCode: 189, modifiers: 8 }
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

  function insertTextCommands(rect, text) {
    return [
      ...clickCommands(rect),
      ["Input.insertText", { text: String(text) }]
    ];
  }

  function printableKeyDescriptor(character) {
    if (PRINTABLE_KEYS[character]) return { ...PRINTABLE_KEYS[character] };
    if (/^[a-zA-Z]$/.test(character)) {
      const upper = character.toUpperCase();
      return {
        key: character,
        code: `Key${upper}`,
        windowsVirtualKeyCode: upper.charCodeAt(0),
        ...(character === upper ? { modifiers: 8 } : {})
      };
    }
    if (/^[0-9]$/.test(character)) {
      return { key: character, code: `Digit${character}`, windowsVirtualKeyCode: character.charCodeAt(0) };
    }
    throw new Error(`Unsupported trusted typing character: ${JSON.stringify(character)}`);
  }

  // Input.dispatchKeyEvent creates browser-trusted KeyboardEvents. A separate
  // char event lets Chromium perform its normal editing action, which in turn
  // produces the beforeinput/input events observed by React-controlled fields.
  function printableKeyCommands(character) {
    const key = printableKeyDescriptor(character);
    const common = {
      key: key.key,
      code: key.code,
      windowsVirtualKeyCode: key.windowsVirtualKeyCode,
      nativeVirtualKeyCode: key.windowsVirtualKeyCode,
      ...(key.modifiers ? { modifiers: key.modifiers } : {})
    };
    return [
      ["Input.dispatchKeyEvent", { type: "rawKeyDown", ...common }],
      ["Input.dispatchKeyEvent", {
        type: "char",
        ...common,
        text: character,
        unmodifiedText: character
      }],
      ["Input.dispatchKeyEvent", { type: "keyUp", ...common }]
    ];
  }

  function trustedReplaceAndSubmitCommands(text, submit = true) {
    const commands = [
      ["Input.dispatchKeyEvent", {
        type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65, modifiers: 4, commands: ["selectAll"]
      }],
      ["Input.dispatchKeyEvent", {
        type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65,
        nativeVirtualKeyCode: 65, modifiers: 4
      }],
      ...keyCommands("Backspace")
    ];
    for (const character of String(text)) commands.push(...printableKeyCommands(character));
    if (submit) commands.push(...keyCommands("Enter"));
    return commands;
  }

  function trustedTypeCommands(text) {
    const commands = [];
    for (const character of String(text)) commands.push(...printableKeyCommands(character));
    return commands;
  }

  function exactEditableExpression(selector) {
    if (typeof selector !== "string" || !selector || selector.length > 512) {
      throw new Error("A non-empty selector of at most 512 characters is required");
    }
    const encoded = JSON.stringify(selector);
    return `(() => {
      const matches = Array.from(document.querySelectorAll(${encoded}));
      if (matches.length !== 1) throw new Error("Expected exactly one nested Godel input, found " + matches.length);
      const element = matches[0];
      const editable = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable;
      if (!editable || element.disabled || element.readOnly) throw new Error("Nested Godel target is not editable");
      return element;
    })()`;
  }

  return {
    clickCommands,
    keyCommands,
    replaceTextCommands,
    insertTextCommands,
    printableKeyCommands,
    trustedReplaceAndSubmitCommands,
    trustedTypeCommands,
    exactEditableExpression
  };
});
