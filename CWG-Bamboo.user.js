// ==UserScript==
// @name         CWG-Bamboo
// @namespace    http://tampermonkey.net/
// @version      v1.2.0-06.26
// @description  A mod that helps and expands your gameplay...
// @author       Ibirtem
// @copyright    2026, Ibirtem
// @supportURL
// @homepageURL
// @match        *://playtest.cw-game.ru/play*
// @updateURL    https://github.com/Ibirtem/CatWarGame-Bamboo/raw/main/CWG-Bamboo.user.js
// @downloadURL  https://github.com/Ibirtem/CatWarGame-Bamboo/raw/main/CWG-Bamboo.user.js
// @license      Apache-2.0
// @iconURL
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        unsafeWindow
// ==/UserScript==

"use strict"; // Я всё ещё крутой. Впереди онли английский, всем бояться.

// ====================================================================================================================
//   . . . SETTINGS MANAGEMENT . . .
// ====================================================================================================================

const bambooDefaultSettings = {
  showTimeHUD: false,
  showDateHUD: false,
  showLocationHUD: false,
  showActionHotbar: false,

  enableBambooChat: false,
  enableLogging: false,
  enableNetworkLogging: false,
  bambooChatHeight: 450,

  eventNotificationSound: "notificationSound1",
  eventNotificationVolume: 5,
  enableEventNotification: false,

  hudTheme: "native",
};

let bambooSettings = {};

/**
 * Loads settings from 'monkey storage with a fallback to localStorage.
 */
function loadSettings() {
  try {
    let stored = null;
    if (typeof GM_getValue !== "undefined") {
      stored = GM_getValue("bamboo_settings", null);
    } else {
      const localStored = localStorage.getItem("bamboo_settings");
      if (localStored) {
        stored = JSON.parse(localStored);
      }
    }

    if (stored && typeof stored === "object") {
      bambooSettings = { ...bambooDefaultSettings, ...stored };
    } else {
      bambooSettings = { ...bambooDefaultSettings };
    }
  } catch (err) {
    bambooSettings = { ...bambooDefaultSettings };
  }
}

/**
 * Saves current settings to 'monkey storage.
 */
function saveSettings() {
  try {
    if (typeof GM_setValue !== "undefined") {
      GM_setValue("bamboo_settings", bambooSettings);
    } else {
      localStorage.setItem("bamboo_settings", JSON.stringify(bambooSettings));
    }
  } catch (err) {
    logger.error("[CWG-Bamboo] Failed to save settings:", err);
  }
}

loadSettings();

// ====================================================================================================================
//   . . . LOGGER MANAGEMENT . . .
// ====================================================================================================================

/**
 * Logger utility that dynamically routes console messages based on user preferences.
 */
const logger = {
  /**
   * Logs general info/debug logs.
   * @param {...any} args - Log arguments.
   */
  log: (...args) => {
    if (bambooSettings.enableLogging) {
      console.log(...args);
    }
  },
  /**
   * Logs warning messages.
   * @param {...any} args - Warning arguments.
   */
  warn: (...args) => {
    if (bambooSettings.enableLogging) {
      console.warn(...args);
    }
  },
  /**
   * Logs critical errors. Errors are always logged to facilitate issue reporting.
   * @param {...any} args - Error arguments.
   */
  error: (...args) => {
    console.error(...args);
  },
};

// ====================================================================================================================
//   . . . NETWORK MANAGER . . .
// ====================================================================================================================

const networkManager = {
  activeSocket: null,

  /**
   * Sends a JSON packet over an active WebSocket connection.
   * @param {Object} packet - The packet object
   */
  sendPacket: (packet) => {
    if (
      networkManager.activeSocket &&
      networkManager.activeSocket.readyState ===
        networkManager.activeSocket.OPEN
    ) {
      try {
        const rawData = JSON.stringify(packet);
        networkManager.activeSocket.send(rawData);

        if (bambooSettings.enableNetworkLogging) {
          console.log(`[CWG-Bamboo WS Packet OUT-BAMBOO]`, packet);
        }
      } catch (e) {
        logger.error("[CWG-Bamboo] Error serializing/sending packet:", e);
      }
    } else {
      logger.warn("[CWG-Bamboo] Unable to send packet: WebSocket is not open.");
    }
  },
};

// ====================================================================================================================
//   . . . NETWORK & CANVAS INTERCEPTORS . . .
// ====================================================================================================================

(function initCoreInterceptors() {
  const gameWindow =
    typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  // -------------------------------------------------------------------------
  // 1. WEBSOCKET INTERCEPTOR
  // -------------------------------------------------------------------------
  const OriginalWebSocket = gameWindow.WebSocket;

  if (OriginalWebSocket) {
    gameWindow.WebSocket = function (url, protocols) {
      if (bambooSettings.enableNetworkLogging) {
        console.log(`[CWG-Bamboo] Intercepted WebSocket connection to: ${url}`);
      }
      const ws = new OriginalWebSocket(url, protocols);

      ws.addEventListener("open", () => {
        networkManager.activeSocket = ws;
        logger.log(
          "[CWG-Bamboo] WebSocket opened and captured by networkManager.",
        );
      });

      ws.addEventListener("close", () => {
        if (networkManager.activeSocket === ws) {
          networkManager.activeSocket = null;
          logger.log(
            "[CWG-Bamboo] WebSocket closed. networkManager reference cleared.",
          );
        }
      });

      ws.addEventListener("message", (event) => {
        try {
          if (typeof event.data === "string") {
            const packet = JSON.parse(event.data);

            if (
              packet &&
              packet.code === 1001 &&
              packet.payload &&
              typeof packet.payload.message === "string"
            ) {
              const sysMessage = packet.payload.message;
              dispatchSystemNotification(sysMessage);

              if (bambooSettings.enableNetworkLogging) {
                console.log(
                  `[CWG-Bamboo WS] Decoded and dispatched system alert: "${sysMessage}"`,
                );
              }
            }

            if (bambooSettings.enableNetworkLogging) {
              console.log("[CWG-Bamboo WS Packet IN]", packet);
            }
          }
        } catch (e) {
          if (bambooSettings.enableNetworkLogging) {
            console.log("[CWG-Bamboo WS Raw IN]", event.data);
          }
        }
      });

      const originalSend = ws.send;
      ws.send = function (data) {
        if (bambooSettings.enableNetworkLogging) {
          try {
            const parsed = JSON.parse(data);
            console.log("[CWG-Bamboo WS Packet OUT-NATIVE]", parsed);
          } catch (e) {
            console.log("[CWG-Bamboo WS Raw OUT-NATIVE]", data);
          }
        }
        return originalSend.apply(this, arguments);
      };

      return ws;
    };
    gameWindow.WebSocket.prototype = OriginalWebSocket.prototype;
    logger.log("[CWG-Bamboo] WebSocket Interceptor armed.");
  }

  // -------------------------------------------------------------------------
  // 2. CANVAS TEXT INTERCEPTOR
  // -------------------------------------------------------------------------
  const OriginalFillText =
    gameWindow.CanvasRenderingContext2D.prototype.fillText;
  const seenCanvasText = new Set();

  gameWindow.CanvasRenderingContext2D.prototype.fillText = function (
    text,
    x,
    y,
    maxWidth,
  ) {
    if (text && typeof text === "string" && text.length > 2) {
      if (!seenCanvasText.has(text)) {
        seenCanvasText.add(text);

        setTimeout(() => {
          seenCanvasText.delete(text);
        }, 3000);

        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("недоступно") ||
          lowerText.includes("выпало") ||
          lowerText.includes("получили")
        ) {
          if (bambooSettings.enableNetworkLogging) {
            console.log(
              `%c[CWG-Bamboo CANVAS ALERT] Rendered: "${text}"`,
              "background: #4A148C; color: #E040FB; font-weight: bold; padding: 2px 6px; border-radius: 4px;",
            );
          }
        } else {
          if (bambooSettings.enableNetworkLogging) {
            console.log(`[CWG-Bamboo Canvas Draw] "${text}"`);
          }
        }
      }
    }

    return OriginalFillText.apply(this, arguments);
  };

  logger.log("[CWG-Bamboo] Canvas Visual Interceptor armed.");
})();

// ====================================================================================================================
//   . . . THEME MANAGEMENT . . .
// ====================================================================================================================

const bambooDefaultThemes = {
  glass: {
    hudBg: "rgba(255, 255, 255, 0.05)",
    hudBorder: "rgba(255, 255, 255, 0.2)",
    hudBlur: "16px",
    hudText: "#ffffff",

    hudUpperBg: "rgba(255, 255, 255, 0.05)",
    hudUpperBorder: "rgba(255, 255, 255, 0.2)",
    hudUpperBlur: "16px",
    hudUpperText: "#ffffff",

    msgBg: "rgba(255, 255, 255, 0.06)",
    msgBorder: "rgba(255, 255, 255, 0.1)",
    msgSelfBg: "rgba(126, 184, 255, 0.12)",
    msgSelfBorder: "rgba(126, 184, 255, 0.25)",
  },
  native: {
    hudBg: "rgba(20, 20, 20, 0.35)",
    hudBorder: "rgba(255, 255, 255, 0.08)",
    hudBlur: "4px",
    hudText: "#ffffff",

    hudUpperBg: "rgba(15, 15, 15, 0.75)",
    hudUpperBorder: "rgba(255, 255, 255, 0.08)",
    hudUpperBlur: "4px",
    hudUpperText: "#ffffff",

    msgBg: "rgba(255, 255, 255, 0.04)",
    msgBorder: "rgba(255, 255, 255, 0.08)",
    msgSelfBg: "rgba(144, 202, 249, 0.08)",
    msgSelfBorder: "rgba(144, 202, 249, 0.2)",
  },
};

/**
 * Dynamically generates and injects CSS variables for the selected theme.
 * Leaves the settings modal "native" by default, but allows overriding.
 */
function applyBambooTheme() {
  const themeId = bambooSettings.hudTheme || "native";
  const theme = bambooDefaultThemes[themeId] || bambooDefaultThemes["native"];

  const oldStyle = document.getElementById("cwg-bamboo-theme-vars");
  if (oldStyle) oldStyle.remove();

  const style = document.createElement("style");
  style.id = "cwg-bamboo-theme-vars";

  style.textContent = /* CSS */ `
    :root {
      --bamboo-accent: #7eb8ff;
      --bamboo-error: #ff6b6b;
      --bamboo-warning: #ffa94d;
      --bamboo-text-primary: #ffffff;
      --bamboo-text-secondary: rgba(255, 255, 255, 0.6);

      --bamboo-modal-bg: rgba(255, 255, 255, 0.05);
      --bamboo-modal-border: rgba(255, 255, 255, 0.2);
      --bamboo-modal-blur: 16px;

      --bamboo-hud-bg: ${theme.hudBg};
      --bamboo-hud-border: ${theme.hudBorder};
      --bamboo-hud-blur: ${theme.hudBlur};
      --bamboo-hud-text: ${theme.hudText};

      --bamboo-hud-upper-bg: ${theme.hudUpperBg};
      --bamboo-hud-upper-border: ${theme.hudUpperBorder};
      --bamboo-hud-upper-blur: ${theme.hudUpperBlur};
      --bamboo-hud-upper-text: ${theme.hudUpperText};
      
      --bamboo-msg-bg: ${theme.msgBg};
      --bamboo-msg-border: ${theme.msgBorder};
      --bamboo-msg-self-bg: ${theme.msgSelfBg};
      --bamboo-msg-self-border: ${theme.msgSelfBorder};
    }
  `;
  document.head.appendChild(style);
}

// ====================================================================================================================
//   . . . CSS INJECTION . . .
// ====================================================================================================================

function injectCustomStyles() {
  const oldStyle = document.getElementById("cwg-bamboo-styles");
  if (oldStyle) oldStyle.remove();

  const style = document.createElement("style");
  style.id = "cwg-bamboo-styles";
  style.textContent = /* CSS */ `
        .glass-panel {
          background-color: var(--bamboo-hud-bg);
          border: 1px solid var(--bamboo-hud-border);
          backdrop-filter: blur(var(--bamboo-hud-blur));
          -webkit-backdrop-filter: blur(var(--bamboo-hud-blur));
          border-radius: 12px;
          box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.2);
          color: var(--bamboo-hud-text);
          font-family: "Montserrat", sans-serif;
        }
        
        .glass-hud-item {
          background-color: var(--bamboo-hud-upper-bg);
          border-color: var(--bamboo-hud-upper-border);
          backdrop-filter: blur(var(--bamboo-hud-upper-blur));
          -webkit-backdrop-filter: blur(var(--bamboo-hud-upper-blur));
          color: var(--bamboo-hud-upper-text);
          
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 0 12px;
          font-size: 14px;
          font-weight: 600;
          height: 30px;
          box-sizing: border-box;
          margin-left: 8px;
          border-radius: 12px;
          line-height: 1;
        }

        .bamboo-circular-btn {
          background-color: var(--bamboo-hud-upper-bg);
          border: 1px solid var(--bamboo-hud-upper-border);
          color: var(--bamboo-hud-upper-text);
          
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.1s ease;
          font-size: 18px;
          padding: 0;
          box-sizing: border-box;
          margin-left: 8px;
        }
        
        .bamboo-circular-btn:hover {
          background-color: rgba(255, 255, 255, 0.15);
        }
        
        .bamboo-circular-btn:active {
          transform: scale(0.92);
        }

        #cwg-bamboo-chat {
          position: fixed;
          bottom: 70px;
          left: 20px;
          width: 420px;
          display: flex;
          flex-direction: column;
          padding: 10px 12px 12px 12px;
          box-sizing: border-box;
          z-index: 998;
          overflow: hidden;
          transition: opacity 0.3s;
        }

        .bamboo-chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--bamboo-hud-border);
          padding-bottom: 6px;
          margin-bottom: 8px;
          user-select: none;
        }

        .bamboo-chat-tabs {
          display: flex;
          gap: 12px;
          font-size: 14px;
          font-weight: 600;
        }

        .bamboo-chat-tab {
          color: var(--bamboo-text-secondary);
          cursor: pointer;
          transition: color 0.2s;
        }

        .bamboo-chat-tab.active {
          color: var(--bamboo-accent);
          border-bottom: 1px solid var(--bamboo-accent);
          padding-bottom: 2px;
        }

        .bamboo-resize-handle {
          width: 16px;
          height: 16px;
          background-color: var(--bamboo-hud-border);
          border-radius: 4px;
          cursor: ns-resize;
          opacity: 0.6;
          transition: opacity 0.2s, background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          line-height: 1;
          color: var(--bamboo-hud-text);
          user-select: none;
          font-weight: bold;
          box-sizing: border-box;
        }

        .bamboo-resize-handle:hover {
          opacity: 1;
          background-color: var(--bamboo-accent);
        }

        #cwg-bamboo-chat-messages {
          flex-grow: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          scroll-behavior: smooth;
          padding: 4px;
        }

        .bamboo-chat-msg {
          font-size: 13px;
          line-height: 1.4;
          word-break: break-word;
          color: var(--bamboo-hud-text);
          padding: 6px 12px;
          border-radius: 12px;
          background: var(--bamboo-msg-bg);
          border: 1px solid var(--bamboo-msg-border);
          max-width: 85%;
          align-self: flex-start;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transition: all 0.2s ease;
        }

        .bamboo-chat-msg.self {
          align-self: flex-end;
          background: var(--bamboo-msg-self-bg);
          border-color: var(--bamboo-msg-self-border);
        }

        .bamboo-chat-msg .time {
          color: var(--bamboo-text-secondary);
          font-size: 12px;
          margin-right: 6px;
          font-family: monospace;
        }

        .bamboo-chat-msg .author {
          font-weight: 700;
          color: var(--bamboo-accent);
        }

        .bamboo-chat-msg.system {
          color: var(--bamboo-warning);
          font-style: italic;
          align-self: center;
          background: rgba(255, 169, 77, 0.05);
          border-color: rgba(255, 169, 77, 0.15);
          max-width: 95%;
          text-align: center;
        }

        body.bamboo-hide-native-bubbles #bamboo-native-bubble-stack > .MuiBox-root {
          display: none !important;
        }

        body.bamboo-hide-native-location #bamboo-native-bubble-stack {
          display: none !important;
        }

        #cwg-bamboo-chat-messages.show-only-system .bamboo-chat-msg:not(.system) {
          display: none !important;
        }

        body.bamboo-hide-native-chat button[aria-label="open chat"] {
          border: 1px solid var(--bamboo-hud-border) !important;
          background-color: var(--bamboo-hud-bg) !important;
          backdrop-filter: blur(var(--bamboo-hud-blur)) !important;
          -webkit-backdrop-filter: blur(var(--bamboo-hud-blur)) !important;
          border-radius: 50% !important;
          transition: background-color 0.2s ease, transform 0.1s ease !important;
        }

        body.bamboo-hide-native-chat button[aria-label="open chat"]:hover {
          background-color: rgba(255, 255, 255, 0.15) !important;
        }

        .bamboo-modal-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        .bamboo-modal-overlay.active {
          opacity: 1;
          pointer-events: auto;
        }

        .bamboo-settings-container {
          background-color: var(--bamboo-modal-bg);
          border: 1px solid var(--bamboo-modal-border);
          backdrop-filter: blur(var(--bamboo-modal-blur));
          -webkit-backdrop-filter: blur(var(--bamboo-modal-blur));
          border-radius: 12px;
          box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.3);
          color: var(--bamboo-text-primary);
          font-family: "Montserrat", sans-serif;
          
          padding: 20px;
          width: 450px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .bamboo-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--bamboo-modal-border);
          padding-bottom: 10px;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .bamboo-settings-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          max-height: 50vh;
          padding-right: 4px;
        }

        .bamboo-settings-category {
          background-color: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .bamboo-settings-category-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--bamboo-accent);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 4px;
          margin-bottom: 2px;
        }

        .bamboo-settings-footer {
          border-top: 1px solid var(--bamboo-modal-border);
          padding-top: 12px;
          margin-top: 4px;
          text-align: center;
          font-size: 12px;
          color: var(--bamboo-text-secondary);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .custom-select {
          position: relative;
          width: 100%;
          font-family: inherit;
          font-size: 13px;
          user-select: none;
        }

        .select-selected {
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--bamboo-modal-border);
          border-radius: 6px;
          padding: 6px 12px;
          cursor: pointer;
          color: var(--bamboo-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background-color 0.2s;
        }

        .select-selected:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .select-items {
          position: absolute;
          background-color: rgba(20, 20, 20, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid var(--bamboo-modal-border);
          border-radius: 6px;
          left: 0;
          right: 0;
          z-index: 99999;
          max-height: 180px;
          overflow-y: auto;
          display: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          margin-top: 4px;
        }

        .custom-select.active .select-items {
          display: block;
        }

        .select-items div {
          color: var(--bamboo-text-primary);
          padding: 8px 12px;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s;
        }

        .select-items div:hover {
          background-color: var(--bamboo-accent);
          color: #000;
        }

        .bamboo-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--bamboo-modal-border);
          border-radius: 6px;
          padding: 6px 10px;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }

        .bamboo-input:focus {
          border-color: var(--bamboo-accent);
        }

        .bamboo-btn {
          background: rgba(126, 184, 255, 0.12);
          border: 1px solid var(--bamboo-modal-border);
          color: var(--bamboo-accent);
          border-radius: 6px;
          padding: 6px 12px;
          cursor: pointer;
          font-weight: 600;
          font-size: 12px;
          font-family: inherit;
          transition: background-color 0.2s, transform 0.1s;
        }

        .bamboo-btn:hover {
          background: rgba(126, 184, 255, 0.25);
        }

        .bamboo-btn:active {
          transform: scale(0.95);
        }

        .bamboo-range-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.15);
          outline: none;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .bamboo-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--bamboo-accent);
          cursor: pointer;
          transition: transform 0.1s;
        }

        .bamboo-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .bamboo-reload-notice {
          background-color: rgba(255, 169, 77, 0.1);
          border: 1px solid var(--bamboo-warning);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--bamboo-warning);
          text-align: center;
          margin-top: 10px;
          display: none;
        }

        .bamboo-storage-error {
          background-color: rgba(255, 107, 107, 0.12);
          border: 1px solid var(--bamboo-error);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--bamboo-error);
          text-align: center;
          margin-top: 10px;
          line-height: 1.3;
        }

        .bamboo-version-badge {
          display: inline-block;
          background: rgba(126, 184, 255, 0.12);
          color: var(--bamboo-accent);
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 700;
          font-family: monospace;
          font-size: 12px;
        }

        .bamboo-news-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
          text-align: left;
          max-height: 220px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .bamboo-news-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          overflow: hidden;
        }

        .bamboo-news-header {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 8px 10px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s;
        }

        .bamboo-news-header:hover {
          background: rgba(255, 255, 255, 0.07);
        }

        .bamboo-news-title {
          color: var(--bamboo-text-secondary);
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-align: left;
        }

        .bamboo-news-body {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          line-height: 1.4;
          background: rgba(0, 0, 0, 0.15);
          color: var(--bamboo-text-primary);
        }

        .bamboo-news-body.open {
          max-height: 160px;
          overflow-y: auto;
        }

        .bamboo-news-body-content {
          padding: 8px 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .bamboo-badge-current {
          background: rgba(126, 184, 255, 0.15);
          color: var(--bamboo-accent);
          padding: 1.5px 5px;
          border-radius: 3px;
          font-weight: 700;
        }

        .bamboo-badge-new {
          background: rgba(255, 169, 77, 0.15);
          color: var(--bamboo-warning);
          padding: 1.5px 5px;
          border-radius: 3px;
          font-weight: 700;
        }

        .bamboo-close-btn {
          background: none; border: none; color: var(--bamboo-text-primary);
          font-size: 1.5rem; cursor: pointer; transition: color 0.2s;
        }
        .bamboo-close-btn:hover { color: var(--bamboo-error); }

        .bamboo-setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.95rem;
        }

        .bamboo-checkbox {
          width: 20px; height: 20px;
          appearance: none;
          border: 2px solid var(--bamboo-modal-border);
          border-radius: 4px;
          background-color: transparent;
          cursor: pointer;
          position: relative;
          transition: background-color 0.2s, border-color 0.2s;
        }
        .bamboo-checkbox:checked {
          background-color: var(--bamboo-accent);
          border-color: var(--bamboo-accent);
        }
        .bamboo-checkbox:checked::after {
          content: "✔";
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          color: #fff;
          font-size: 12px;
        }

        /* --- ACTION HOTBAR --- */
        #cwg-bamboo-hotbar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
          padding: 8px 12px;
          z-index: 997;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .bamboo-hotbar-btn {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          background-color: var(--bamboo-hud-upper-bg);
          border: 1px solid var(--bamboo-hud-upper-border);
          color: var(--bamboo-hud-upper-text);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.1s ease, filter 0.2s ease;
          user-select: none;
          position: relative;
        }

        .bamboo-hotbar-btn:hover:not(.disabled) {
          background-color: rgba(255, 255, 255, 0.15);
        }

        .bamboo-hotbar-btn:active:not(.disabled) {
          transform: scale(0.92);
        }

        .bamboo-hotbar-btn.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(100%);
        }

        .bamboo-hotbar-icon {
          font-size: 18px;
          line-height: 1;
        }

        .bamboo-hotbar-label {
          font-size: 9px;
          font-weight: 600;
          margin-top: 4px;
          opacity: 0.8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 42px;
        }
    `;
  document.head.appendChild(style);
}

// ====================================================================================================================
//   . . . UTILITIES (DYNAMIC OBSERVERS) . . .
// ====================================================================================================================

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Waits for an element to appear in the DOM, then executes a callback.
 * Crucial for React apps where UI components mount asynchronously after data loads.
 *
 * @param {string} selector - CSS selector of the target element.
 * @param {Function} callback - Function to run once the element is found.
 * @param {number} maxAttempts - Max polling attempts before giving up.
 * @param {number} delay - Polling interval in milliseconds.
 */
async function setupSingleCallback(
  selector,
  callback,
  maxAttempts = 20,
  delay = 500,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  logger.warn(
    `[CWG Mod] Element "${selector}" not found after ${maxAttempts} attempts.`,
  );
}

/**
 * Monitors a target element matching the selector for mutations once it appears in the DOM.
 * Incorporates debounce logic to prevent excessive callback execution.
 *
 * @param {string} selector - CSS selector of the element to watch.
 * @param {Function} callback - Function to execute on mutation.
 * @param {MutationObserverInit} [options] - Options configuration for the MutationObserver.
 * @param {number} [maxAttempts=20] - Max polling attempts before giving up.
 * @param {number} [delay=500] - Polling interval in milliseconds.
 * @param {number} [debounceTime=100] - Debounce delay for callback triggers.
 */
async function setupMutationObserver(
  selector,
  callback,
  options = { attributes: true, attributeFilter: ["style"] },
  maxAttempts = 20,
  delay = 500,
  debounceTime = 100,
) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const element = document.querySelector(selector);
    if (element) {
      const observer = new MutationObserver(debounce(callback, debounceTime));
      observer.observe(element, options);
      callback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  logger.warn(
    `[CWG-Bamboo] Element with selector "${selector}" not found for mutation setup after ${maxAttempts} attempts.`,
  );
}

/**
 * Waits for the global CWGPlayground API to be injected by the game.
 * Uses unsafeWindow to bypass Tampermonkey's sandbox isolation and access the real DOM.
 *
 * @returns {Promise<Object>} The CWGPlayground object.
 */
async function waitForPlayground() {
  logger.log(
    "[CWG-Bamboo] Waiting for CWGPlayground to appear in game window...",
  );
  let attempts = 0;

  const gameWindow =
    typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  while (typeof gameWindow.CWGPlayground === "undefined") {
    attempts++;
    if (attempts % 10 === 0) {
      logger.warn(
        `[CWG-Bamboo] Still waiting for CWGPlayground... (Attempt ${attempts}). Make sure you are spawned in the game!`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.log("[CWG-Bamboo] CWGPlayground API detected successfully!");
  return gameWindow.CWGPlayground;
}

// ====================================================================================================================
//   . . . UPDATE CHECKS . . .
// ====================================================================================================================

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/Ibirtem/CatWarGame-Bamboo/main/news/";
const MANIFEST_URL = `${GITHUB_RAW_BASE}manifest.json`;

let newsManifestCache = null;

function fetchWithGM(url) {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest === "undefined") {
      reject(new Error("GM_xmlhttpRequest is not available"));
      return;
    }
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      timeout: 5000,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          resolve(response.responseText);
        } else {
          reject(new Error(`HTTP Error: ${response.status}`));
        }
      },
      onerror: (err) => reject(err),
      ontimeout: () => reject(new Error("Request timed out")),
    });
  });
}

async function loadNewsManifest() {
  if (newsManifestCache) return newsManifestCache;
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const parsed = await response.json();
    newsManifestCache = parsed;
    return parsed;
  } catch (err) {
    logger.error("[CWG-Bamboo] Failed to load news manifest via fetch:", err);
    return null;
  }
}

async function loadNewsContent(version) {
  try {
    const url = `${GITHUB_RAW_BASE}${version}.html`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (err) {
    logger.error(
      `[CWG-Bamboo] Failed to load news content for ${version} via fetch:`,
      err,
    );
    return `<div style="color: var(--error); padding: 8px;">⚠️ Не удалось загрузить содержимое обновления.</div>`;
  }
}

// ====================================================================================================================
//   . . . CUSTOM SOUNDS & DROPDOWNS CONTROLLERS . . .
// ====================================================================================================================

/**
 * Loads custom user sounds from storage with a fallback to localStorage.
 * Keeps data isolated from core settings to prevent corruption.
 *
 * @returns {Array<{id: string, name: string, url: string}>} Array of user-defined sounds.
 */
function loadCustomSounds() {
  try {
    let stored = null;
    if (typeof GM_getValue !== "undefined") {
      stored = GM_getValue("bamboo_customSounds", null);
    } else {
      const localStored = localStorage.getItem("bamboo_customSounds");
      if (localStored) {
        stored = JSON.parse(localStored);
      }
    }

    const sounds = Array.isArray(stored) ? stored : [];
    soundManager.registerSound(sounds);
  } catch (err) {
    logger.error("[CWG-Bamboo] Failed to load custom sounds:", err);
  }
}

/**
 * Saves the custom user sounds array back to persistent storage.
 *
 * @param {Array<{id: string, name: string, url: string}>} sounds - The custom sounds array.
 */
function saveCustomSounds(sounds) {
  try {
    if (typeof GM_setValue !== "undefined") {
      GM_setValue("bamboo_customSounds", sounds);
    } else {
      localStorage.setItem("bamboo_customSounds", JSON.stringify(sounds));
    }
  } catch (err) {
    logger.error("[CWG-Bamboo] Failed to save custom sounds:", err);
  }
}

/**
 * Appends a unified "Test Sound" button to the specified container.
 *
 * @param {string} containerId - DOM ID of the container element.
 * @param {string} settingsKeyForSound - The setting key holding the active sound ID.
 * @param {string} settingsKeyForVolume - The setting key holding the volume value (1-10).
 */
function addSoundTestButton(
  containerId,
  settingsKeyForSound,
  settingsKeyForVolume,
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const testButton = document.createElement("button");
  testButton.className = "bamboo-btn";
  testButton.style.padding = "4px 8px";
  testButton.textContent = "Тест звука";

  testButton.addEventListener("click", (e) => {
    e.preventDefault();
    const selectedSoundId = bambooSettings[settingsKeyForSound];
    const volume = bambooSettings[settingsKeyForVolume] || 5;
    if (selectedSoundId) {
      soundManager.playSound(selectedSoundId, volume).catch(() => {});
    }
  });

  container.appendChild(testButton);
}

/**
 * Builds and initializes a custom select element. I really like to steal my own work.
 *
 * @param {string} selectId - DOM ID of the select container.
 * @param {Array<{id: string, name: string}>} options - Dropdown items.
 */
function createCustomSelect(selectId, options) {
  const selectContainer = document.getElementById(selectId);
  if (!selectContainer) return;
  const selectedElement = selectContainer.querySelector(".select-selected");
  const optionsContainer = selectContainer.querySelector(".select-items");
  if (!selectedElement || !optionsContainer) return;

  if (bambooSettings && bambooSettings[selectId] !== undefined) {
    const selectedOption = options.find(
      (option) => option.id === bambooSettings[selectId],
    );
    if (selectedOption) {
      selectedElement.textContent = selectedOption.name;
    }
  }

  optionsContainer.innerHTML = "";

  options.forEach((option) => {
    const optionElement = document.createElement("div");
    optionElement.textContent = option.name;
    optionElement.dataset.id = option.id;

    optionElement.addEventListener("click", () => {
      selectedElement.textContent = option.name;
      bambooSettings[selectId] = option.id;
      saveSettings();
      selectContainer.classList.remove("active");
      selectContainer.dispatchEvent(new Event("change"));
    });

    optionsContainer.appendChild(optionElement);
  });

  if (!selectContainer.dataset.listenerAttached) {
    selectedElement.addEventListener("click", () => {
      selectContainer.classList.toggle("active");
    });
    selectContainer.dataset.listenerAttached = "true";
  }
}

/**
 * Re-renders user's custom sounds list inside the modal.
 */
function renderCustomSoundsList() {
  const listEl = document.getElementById("custom-sounds-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  let stored = null;
  if (typeof GM_getValue !== "undefined") {
    stored = GM_getValue("bamboo_customSounds", null);
  } else {
    const localStored = localStorage.getItem("bamboo_customSounds");
    if (localStored) {
      stored = JSON.parse(localStored);
    }
  }
  const sounds = Array.isArray(stored) ? stored : [];

  if (sounds.length === 0) {
    listEl.innerHTML =
      "<p style='opacity: 0.5; text-align: center; margin: 0; font-size: 11px;'>Нет добавленных звуков.</p>";
    return;
  }

  sounds.forEach((sound) => {
    const itemEl = document.createElement("div");
    itemEl.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); font-size: 11px; gap: 8px;";

    const meta = document.createElement("div");
    meta.style.cssText =
      "display: flex; flex-direction: column; overflow: hidden; margin-right: 10px; flex: 1;";

    const nameEl = document.createElement("span");
    nameEl.style.cssText = "font-weight: bold;";
    nameEl.textContent = sound.name;

    const urlEl = document.createElement("span");
    urlEl.style.cssText =
      "font-size: 10px; opacity: 0.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
    urlEl.textContent = sound.url;

    const actions = document.createElement("div");
    actions.style.cssText = "display: flex; gap: 4px;";

    const playBtn = document.createElement("button");
    playBtn.className = "bamboo-btn";
    playBtn.style.padding = "2px 6px";
    playBtn.textContent = "▶";
    playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      soundManager.playSound(sound.id, 5).catch(() => {});
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "bamboo-btn";
    deleteBtn.style.cssText =
      "padding: 2px 6px; border-color: var(--error); color: var(--error); background: rgba(255,107,107,0.1);";
    deleteBtn.textContent = "✖";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      deleteCustomSound(sound.id);
    });

    meta.append(nameEl, urlEl);
    actions.append(playBtn, deleteBtn);
    itemEl.append(meta, actions);

    listEl.appendChild(itemEl);
  });
}

/**
 * Rebuilds all sound-related custom select dropdowns dynamically.
 * Zero hardcode. Processes any select ending with "Sound".
 */
function updateAllSoundSelects() {
  const currentSounds = soundManager.getSoundList();

  document.querySelectorAll(".custom-select").forEach((selectContainer) => {
    const selectId = selectContainer.id;
    if (selectId && selectId.endsWith("Sound")) {
      createCustomSelect(selectId, currentSounds);

      const baseName = selectId.replace("Sound", "");
      const testContainerId = `${baseName}SoundContainer`;
      const volKey = `${baseName}Volume`;

      addSoundTestButton(testContainerId, selectId, volKey);
    }
  });
}

/**
 * Deletes custom sound.
 *
 * @param {string} id - The sound ID.
 */
function deleteCustomSound(id) {
  if (!confirm("Вы уверены, что хотите удалить этот звук?")) return;

  let stored = null;
  if (typeof GM_getValue !== "undefined") {
    stored = GM_getValue("bamboo_customSounds", null);
  } else {
    const localStored = localStorage.getItem("bamboo_customSounds");
    if (localStored) {
      stored = JSON.parse(localStored);
    }
  }
  let sounds = Array.isArray(stored) ? stored : [];
  sounds = sounds.filter((s) => s.id !== id);

  saveCustomSounds(sounds);

  soundManager.unregisterSound(id);
  renderCustomSoundsList();
  updateAllSoundSelects();
}

// ====================================================================================================================
//   . . . SOUND MANAGER . . .
// ====================================================================================================================

/**
 * @typedef {Object} SoundDefinition
 * @property {string} id - Unique identifier for the sound.
 * @property {string} name - Display name for the UI.
 * @property {string} url - Source URL of the audio file.
 * @property {boolean} isCustom - Indicates if the sound is user-defined.
 * @property {HTMLAudioElement|null} audio - Cached Audio instance.
 */

function createSoundManager() {
  /** @type {Map<string, SoundDefinition>} */
  const soundRegistry = new Map();
  let isUserInteracted = false;
  let pendingSounds = [];

  /**
   * Retrieves or initializes an Audio instance for the given sound ID.
   *
   * @param {string} id - The sound identifier.
   * @returns {HTMLAudioElement|null} The cached Audio instance.
   */
  function getAudioInstance(id) {
    const soundDef = soundRegistry.get(id);
    if (!soundDef) return null;

    if (!soundDef.audio) {
      soundDef.audio = new Audio(soundDef.url);
    }
    return soundDef.audio;
  }

  /**
   * Registers sound files in the manager. Supports both a single sound definition
   * and an array of sound objects.
   *
   * @param {string|Array<Object>} idOrSounds - Unique identifier, or an array of sound objects.
   * @param {string} [name] - Display name for the UI.
   * @param {string} [url] - Source URL of the audio file.
   * @param {boolean} [isCustom=false] - Indicates if the sound is user-defined.
   */
  function registerSound(idOrSounds, name, url, isCustom = false) {
    if (Array.isArray(idOrSounds)) {
      idOrSounds.forEach((sound) => {
        if (sound && sound.id && sound.name && sound.url) {
          soundRegistry.set(sound.id, {
            id: sound.id,
            name: sound.name,
            url: sound.url,
            isCustom: !!sound.isCustom,
            audio: null,
          });
        }
      });
    } else if (typeof idOrSounds === "string") {
      soundRegistry.set(idOrSounds, {
        id: idOrSounds,
        name: name || "",
        url: url || "",
        isCustom: !!isCustom,
        audio: null,
      });
    }
  }

  /**
   * Removes a sound from the registry by its ID.
   *
   * @param {string} id - The sound identifier to remove.
   */
  function unregisterSound(id) {
    soundRegistry.delete(id);
  }

  /**
   * Returns a formatted list of all registered sounds for UI dropdowns.
   *
   * @returns {Array<{id: string, name: string, isCustom: boolean}>} Array of registered sound definitions.
   */
  function getSoundList() {
    return Array.from(soundRegistry.values()).map((def) => ({
      id: def.id,
      name: def.name,
      isCustom: def.isCustom,
    }));
  }

  /**
   * Plays the sound with the given ID and volume. Handles browser autoplay policies.
   *
   * @param {string} id - The sound identifier.
   * @param {number} volume - Volume level (0 to 10).
   * @returns {Promise<void>} Resolves when audio play successfully starts.
   */
  function playSound(id, volume) {
    return new Promise((resolve, reject) => {
      const audio = getAudioInstance(id);
      if (audio) {
        audio.currentTime = 0;
        audio.volume = Math.max(0, Math.min(1, volume / 10));

        audio
          .play()
          .then(resolve)
          .catch((error) => {
            if (!isUserInteracted) {
              logger.warn(
                "[CWG-Bamboo] Audio blocked by autoplay policy. Waiting for user interaction.",
              );
              pendingSounds.push({ id, volume, resolve });
            } else {
              logger.warn(`[CWG-Bamboo] Failed to play sound ${id}:`, error);
              reject(error);
            }
          });
      } else {
        reject(new Error(`[CWG-Bamboo] Sound with ID ${id} not found.`));
      }
    });
  }

  function playSoundNow(id, volume, resolve) {
    const audio = getAudioInstance(id);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume / 10));
      audio
        .play()
        .then(resolve)
        .catch((error) => {
          logger.error(
            `[CWG-Bamboo] Failed to play pending sound ${id}:`,
            error,
          );
          resolve();
        });
    }
  }

  function handleUserInteraction() {
    isUserInteracted = true;

    document.removeEventListener("mousedown", handleUserInteraction);
    document.removeEventListener("touchstart", handleUserInteraction);
    document.removeEventListener("keydown", handleUserInteraction);

    pendingSounds.forEach(({ id, volume, resolve }) => {
      playSoundNow(id, volume, resolve);
    });
    pendingSounds = [];
  }

  document.addEventListener("mousedown", handleUserInteraction);
  document.addEventListener("touchstart", handleUserInteraction);
  document.addEventListener("keydown", handleUserInteraction);

  return {
    registerSound,
    unregisterSound,
    getSoundList,
    playSound,
  };
}

const soundManager = createSoundManager();

soundManager.registerSound([
  {
    id: "notificationSound1",
    name: "Звук 1",
    url: "https://github.com/Ibirtem/CatWar/raw/main/sounds/notification_1.mp3",
  },
  {
    id: "notificationSound2",
    name: "Звук 2",
    url: "https://github.com/Ibirtem/CatWar/raw/main/sounds/notification_2.mp3",
  },
  {
    id: "notificationSound3",
    name: "Звук 3",
    url: "https://github.com/Ibirtem/CatWar/raw/main/sounds/notification_3.mp3",
  },
  {
    id: "notificationBlockSound1",
    name: "Блокирование",
    url: "https://github.com/Ibirtem/CatWar/raw/main/sounds/block_1.mp3",
  },
]);

// ====================================================================================================================
//   . . . MODAL UI . . .
// ====================================================================================================================

/**
 * Returns the inner HTML markup for the Settings Modal.
 *
 * @param {string} errorHTML - The error alert container HTML (empty if storage API is available).
 * @returns {string} Fully structured HTML template.
 */
const getSettingsModalTemplate = (errorHTML) => /* HTML */ `
  <div class="glass-panel bamboo-settings-container">
    <div class="bamboo-settings-header">
      <span>🎋 Настройки Бамбука</span>
      <button class="bamboo-close-btn" id="bamboo-close-btn">&times;</button>
    </div>

    ${errorHTML}
    <div class="bamboo-reload-notice" id="cwg-bamboo-reload-notice">
      ⏳ Для гарантированного применения изменений перезагрузите страницу.
    </div>

    <div class="bamboo-settings-content">
      <!-- HUD Overlays -->
      <div class="bamboo-settings-category">
        <div class="bamboo-settings-category-title">Интерфейс (HUD)</div>

        <div
          class="bamboo-setting-row"
          style="flex-direction: column; align-items: flex-start; gap: 6px; margin-bottom: 6px;"
        >
          <span>Тема интерфейса</span>
          <div class="custom-select" id="hudTheme" style="width: 100%;">
            <div class="select-selected">Выберите тему</div>
            <div class="select-items"></div>
          </div>
        </div>

        <div class="bamboo-setting-row">
          <span>Показывать время</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="showTimeHUD"
          />
        </div>
        <div class="bamboo-setting-row">
          <span>Показывать дату</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="showDateHUD"
          />
        </div>
        <div class="bamboo-setting-row">
          <span>Показывать локацию</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="showLocationHUD"
          />
        </div>
        <div class="bamboo-setting-row">
          <span>Панель действий (Хот-бар)</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="showActionHotbar"
          />
        </div>
      </div>

      <!-- Chat & Communication -->
      <div class="bamboo-settings-category">
        <div class="bamboo-settings-category-title">
          Общение и Взаимодействие
        </div>
        <div class="bamboo-setting-row">
          <span>Улучшенный чат</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="enableBambooChat"
          />
        </div>
      </div>

      <!-- Sounds & Notifications -->
      <div class="bamboo-settings-category">
        <div class="bamboo-settings-category-title">Звуки и Уведомления</div>
        <div
          class="bamboo-setting-row"
          style="flex-direction: column; align-items: flex-start; gap: 6px;"
        >
          <span>Уведомление События</span>
          <div
            style="display: flex; gap: 8px; width: 100%; align-items: center;"
          >
            <input
              type="checkbox"
              class="bamboo-checkbox"
              data-setting="enableEventNotification"
              title="Включить звуковые уведомления о событиях"
            />
            <div
              class="custom-select"
              id="eventNotificationSound"
              style="flex: 1;"
            >
              <div class="select-selected">Выберите звук</div>
              <div class="select-items"></div>
            </div>
            <div
              class="volume-control"
              style="width: 110px; display: flex; align-items: center; gap: 6px;"
            >
              <span>🔊</span>
              <input
                type="range"
                min="1"
                max="10"
                class="bamboo-range-slider"
                id="eventNotificationVolume"
                data-setting="eventNotificationVolume"
              />
            </div>
            <div id="eventNotificationSoundContainer"></div>
          </div>
        </div>

        <!-- Add Custom Sound Form -->
        <div
          style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;"
        >
          <div
            style="font-size: 11px; opacity: 0.7; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;"
          >
            Добавить свой звук:
          </div>
          <div style="display: flex; gap: 6px;">
            <input
              type="text"
              id="custom-sound-name"
              placeholder="Название"
              class="bamboo-input"
              style="width: 100px;"
            />
            <input
              type="text"
              id="custom-sound-url"
              placeholder="URL"
              class="bamboo-input"
              style="flex: 1;"
            />
            <button id="add-custom-sound-btn" class="bamboo-btn">＋</button>
          </div>
          <div
            id="custom-sounds-list"
            style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;"
          ></div>
        </div>
      </div>

      <!-- System, Logging & Debug -->
      <div class="bamboo-settings-category">
        <div class="bamboo-settings-category-title">Отладка и Разработка</div>
        <div class="bamboo-setting-row">
          <span>Логирование мода</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="enableLogging"
          />
        </div>
        <div class="bamboo-setting-row">
          <span>Логирование сети</span>
          <input
            type="checkbox"
            class="bamboo-checkbox"
            data-setting="enableNetworkLogging"
          />
        </div>
      </div>
    </div>

    <div class="bamboo-settings-footer"></div>
  </div>
`;

/**
 * Matches DOM inputs with active settings values on load.
 * Lmao stole it from my other mod.
 */
function syncSettingsUI() {
  const container = document.getElementById("cwg-bamboo-modal");
  if (!container) return;

  container.querySelectorAll("[data-setting]").forEach((element) => {
    const setting = element.dataset.setting;
    if (element.type === "checkbox") {
      element.checked = bambooSettings[setting];
    } else {
      element.value = bambooSettings[setting];
    }
  });
}

/**
 * Binds onchange listeners to settings inputs.
 * Saves values and alerts the user if reload is required.
 */
function bindSettingsListeners() {
  const container = document.getElementById("cwg-bamboo-modal");
  if (!container) return;

  container.querySelectorAll("[data-setting]").forEach((element) => {
    const setting = element.dataset.setting;
    element.addEventListener("change", (e) => {
      if (element.type === "checkbox") {
        bambooSettings[setting] = element.checked;
      } else {
        bambooSettings[setting] = element.value;
      }
      saveSettings();

      const notice = document.getElementById("cwg-bamboo-reload-notice");
      if (notice) notice.style.display = "block";

      if (setting === "showTimeHUD") {
        const timeHud = document.getElementById("cwg-bamboo-time");
        if (timeHud) timeHud.style.display = element.checked ? "flex" : "none";
      }

      if (setting === "showDateHUD") {
        const dateHud = document.getElementById("cwg-bamboo-date");
        if (element.checked) {
          if (dateHud) {
            dateHud.style.display = "flex";
          } else {
            initDateHUD();
          }
        } else {
          if (dateHud) dateHud.style.display = "none";
        }
      }

      if (setting === "showLocationHUD") {
        const locHud = document.getElementById("cwg-bamboo-location");
        if (element.checked) {
          document.body.classList.add("bamboo-hide-native-location");
          if (locHud) {
            locHud.style.display = "flex";
          } else {
            initLocationHUD();
          }
        } else {
          document.body.classList.remove("bamboo-hide-native-location");
          if (locHud) locHud.style.display = "none";
        }
      }

      if (setting === "showActionHotbar") {
        const hotbar = document.getElementById("cwg-bamboo-hotbar");
        if (element.checked) {
          if (hotbar) hotbar.style.display = "flex";
          else initHotbarHUD();
        } else {
          if (hotbar) hotbar.style.display = "none";
        }
      }
    });
  });
}

/**
 * Injects the standalone settings modal into the body.
 * Structures settings into functional categorization blocks and sets up the version checking footer.
 */
function createSettingsModal() {
  const overlay = document.createElement("div");
  overlay.className = "bamboo-modal-overlay";
  overlay.id = "cwg-bamboo-modal";

  const hasGMSupport =
    typeof GM_getValue !== "undefined" && typeof GM_setValue !== "undefined";

  const errorHTML = !hasGMSupport
    ? `<div class="bamboo-storage-error">⚠️ Tampermonkey API недоступно. Настройки будут сохранены локально для этого домена.</div>`
    : "";

  overlay.innerHTML = getSettingsModalTemplate(errorHTML);
  document.body.appendChild(overlay);

  syncSettingsUI();
  bindSettingsListeners();

  renderFooterNews();
  renderCustomSoundsList();
  updateAllSoundSelects();

  createCustomSelect("hudTheme", [
    { id: "glass", name: "Стеклянная (Glassmorphism)" },
    { id: "native", name: "Нативная (Сайтовая)" },
  ]);

  initSettingsModalEvents(overlay);
}

/**
 * Wires up event listeners for inputs, custom controls, and custom sound uploads
 * inside the settings modal.
 *
 * @param {HTMLElement} overlay - The settings modal overlay element.
 */
function initSettingsModalEvents(overlay) {
  overlay.querySelectorAll('input[type="range"]').forEach((slider) => {
    slider.addEventListener("change", (e) => {
      const val = Number(e.target.value);
      const setting = e.target.dataset.setting;
      bambooSettings[setting] = val;
      saveSettings();
    });
  });

  const addBtn = overlay.querySelector("#add-custom-sound-btn");
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleCustomSoundUpload(overlay);
    });
  }

  overlay.querySelector("#bamboo-close-btn").addEventListener("click", () => {
    overlay.classList.remove("active");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("active");
    }
  });
}

/**
 * Handles parsing, validating, and saving a new custom sound from modal input fields.
 *
 * @param {HTMLElement} overlay - The settings modal overlay element.
 */
function handleCustomSoundUpload(overlay) {
  const nameInput = overlay.querySelector("#custom-sound-name");
  const urlInput = overlay.querySelector("#custom-sound-url");
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) {
    alert("Пожалуйста, заполните оба поля (Название и URL).");
    return;
  }

  const id =
    "customSound_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 7);
  const newSound = { id, name, url };

  let stored = null;
  if (typeof GM_getValue !== "undefined") {
    stored = GM_getValue("bamboo_customSounds", null);
  } else {
    const localStored = localStorage.getItem("bamboo_customSounds");
    if (localStored) {
      stored = JSON.parse(localStored);
    }
  }
  const sounds = Array.isArray(stored) ? stored : [];
  sounds.push(newSound);

  saveCustomSounds(sounds);

  soundManager.registerSound(id, name, url, true);

  nameInput.value = "";
  urlInput.value = "";

  renderCustomSoundsList();
  updateAllSoundSelects();
}

/**
 * Compares two version strings (e.g., "v1.46.0-06.26" vs "v1.0.0-06.26").
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if equal.
 *
 * @param {string} v1 - First version string.
 * @param {string} v2 - Second version string.
 * @returns {number} Comparison result.
 */
function compareVersions(v1, v2) {
  if (typeof v1 !== "string" || typeof v2 !== "string") return 0;

  const clean = (v) => v.replace(/^v/, "").split("-")[0].split(".").map(Number);
  const p1 = clean(v1);
  const p2 = clean(v2);

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Handles async version checking and accordion list rendering in the footer.
 */
async function renderFooterNews() {
  const footerContainer = document.querySelector(".bamboo-settings-footer");
  if (!footerContainer) return;

  const scriptVersion =
    typeof GM_info !== "undefined" ? GM_info.script.version : "v1.0.0-06.26";

  footerContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px;">
      <div>Версия: <span class="bamboo-version-badge">${scriptVersion}</span></div>
      <div id="bamboo-latest-version-status">⏳ Поиск обновлений...</div>
    </div>
    <div class="bamboo-news-list" id="bamboo-news-list">
      <div style="font-size: 10px; opacity: 0.6; text-align: center; padding: 10px 0;">Проверка манифеста...</div>
    </div>
  `;

  const manifest = await loadNewsManifest();
  const statusElement = document.getElementById("bamboo-latest-version-status");
  const listElement = document.getElementById("bamboo-news-list");

  if (!manifest) {
    if (statusElement)
      statusElement.innerHTML = `<span style="color: var(--error);">Ошибка проверки</span>`;
    if (listElement) {
      listElement.innerHTML = `<div style="font-size: 10px; opacity: 0.5; text-align: center; padding: 10px 0;">Не удалось загрузить историю обновлений.</div>`;
    }
    return;
  }

  const verComparison = compareVersions(scriptVersion, manifest.latest);
  const isLatest = verComparison === 0;
  const isLocalOlder = verComparison === -1;

  if (statusElement) {
    if (verComparison === 1) {
      statusElement.innerHTML = `<span style="color: #7eb8ff;">● Вы что, тестировщик или разраб?</span>`;
    } else if (isLatest) {
      statusElement.innerHTML = `<span style="color: #a9e08f;">● Актуальная</span>`;
    } else {
      statusElement.innerHTML = `<span style="color: var(--warning); font-weight: 700;">● Обновление: ${manifest.latest}</span>`;
    }
  }

  if (listElement && Array.isArray(manifest.updates)) {
    listElement.innerHTML = "";

    manifest.updates.forEach((update) => {
      const isThisCurrent = update.version === scriptVersion;
      const isThisLatest = update.version === manifest.latest;

      let badgeHTML = "";
      if (isThisCurrent) {
        badgeHTML = `<span class="bamboo-badge-current">Установлена</span>`;
      } else if (isThisLatest && !isLatest) {
        badgeHTML = `<span class="bamboo-badge-new">Новая!</span>`;
      }

      const itemHTML = /* HTML */ `
        <div class="bamboo-news-item" data-version="${update.version}">
          <div class="bamboo-news-header">
            <div
              style="display: flex; align-items: center; gap: 6px; width: 100%; margin-bottom: 2px;"
            >
              <span class="bamboo-version-badge">${update.version}</span>
              <span style="opacity: 0.5; font-size: 10px; font-weight: normal;"
                >${update.date}</span
              >
              ${badgeHTML}
            </div>
            <div class="bamboo-news-title" title="${update.title}">
              ${update.title}
            </div>
          </div>
          <div class="bamboo-news-body">
            <div class="bamboo-news-body-content">
              <div
                style="font-size: 10px; opacity: 0.5; text-align: center; padding: 8px 0;"
              >
                Загрузка деталей...
              </div>
            </div>
          </div>
        </div>
      `;
      listElement.insertAdjacentHTML("beforeend", itemHTML);
    });

    listElement.querySelectorAll(".bamboo-news-item").forEach((item) => {
      const header = item.querySelector(".bamboo-news-header");
      const body = item.querySelector(".bamboo-news-body");
      const content = item.querySelector(".bamboo-news-body-content");
      const version = item.dataset.version;

      header.addEventListener("click", async () => {
        const isOpen = body.classList.contains("open");

        listElement.querySelectorAll(".bamboo-news-body").forEach((b) => {
          b.classList.remove("open");
        });

        if (!isOpen) {
          if (content.getAttribute("data-loaded") !== "true") {
            const html = await loadNewsContent(version);
            content.innerHTML = html;
            content.setAttribute("data-loaded", "true");
          }

          body.classList.add("open");
        }
      });
    });
  }
}

function toggleSettingsModal() {
  const modal = document.getElementById("cwg-bamboo-modal");
  if (modal) {
    modal.classList.toggle("active");
  }
}

// ====================================================================================================================
//   . . . FEATURES (HUD & LOGIC) . . .
// ====================================================================================================================

/**
 * Resolves the native top-left container that holds location text and floating speech bubbles.
 * Searches nested MUI structures and strictly filters out stacks containing buttons or SVGs
 * to avoid misidentifying the top-right utility actions container.
 *
 * @returns {HTMLElement|null} The resolved native stack, or null if not found.
 */
function tagNativeLocationStack() {
  const tagged = document.getElementById("bamboo-native-bubble-stack");
  if (tagged) return tagged;

  const candidates = document.querySelectorAll(
    ".MuiStack-root .MuiStack-root span",
  );

  for (const span of candidates) {
    const innerStack = span.closest(".MuiStack-root");
    if (!innerStack) continue;

    const parentStack = innerStack.parentElement;
    if (parentStack && parentStack.classList.contains("MuiStack-root")) {
      if (
        parentStack.querySelector("button") ||
        parentStack.querySelector("svg")
      ) {
        continue;
      }

      parentStack.id = "bamboo-native-bubble-stack";
      logger.log(
        "[CWG-Bamboo] Successfully located and tagged native bubble/location stack.",
      );
      return parentStack;
    }
  }
  return null;
}

/**
 * Injects a circular settings button (🎋) into the game's native top-right utility button stack.
 * Places it beautifully next to the native fullscreen and gear buttons.
 */
function initSettingsButton() {
  const utilityStackSelector = ".MuiStack-root.css-1xhj18k";
  logger.log(
    `[CWG-Bamboo] Searching for target utility stack: "${utilityStackSelector}"`,
  );

  setupSingleCallback(utilityStackSelector, (stackContainer) => {
    if (document.getElementById("cwg-bamboo-settings-btn")) {
      return;
    }

    const settingsBtn = document.createElement("button");
    settingsBtn.className =
      "MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall bamboo-circular-btn";
    settingsBtn.id = "cwg-bamboo-settings-btn";
    settingsBtn.innerHTML = "🎋";
    settingsBtn.title = "CWG-Bamboo Settings";
    settingsBtn.type = "button";

    settingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettingsModal();
    });

    stackContainer.appendChild(settingsBtn);
    logger.log(
      "[CWG-Bamboo] Circular settings button successfully integrated into utility stack.",
    );
  });
}

/**
 * Safely formats the game date into a readable HH:MM format.
 * Adapted to parse the specific object wrapper (e.g., { value: Array(5), hour, minute }) returned by the game's API.
 *
 * @param {any} rawDate - Raw game date object from getDate().
 * @param {any} vTime - Raw virtual time object from getVirtualTime().
 * @returns {string} Formatted time string (e.g., "14:05") or fallback text.
 */
function formatGameTime(rawDate, vTime) {
  let hour, minute;

  if (
    rawDate &&
    typeof rawDate.hour === "number" &&
    typeof rawDate.minute === "number"
  ) {
    hour = rawDate.hour;
    minute = rawDate.minute;
  } else if (
    rawDate &&
    Array.isArray(rawDate.value) &&
    rawDate.value.length >= 5
  ) {
    hour = rawDate.value[3];
    minute = rawDate.value[4];
  } else if (
    vTime &&
    vTime.virtualDate &&
    Array.isArray(vTime.virtualDate.value)
  ) {
    hour = vTime.virtualDate.value[3];
    minute = vTime.virtualDate.value[4];
  } else {
    return "⏳ Sync...";
  }

  let emoji = "🕒";
  if (hour >= 6 && hour < 12) emoji = "🌅";
  else if (hour >= 12 && hour < 18) emoji = "☀️";
  else if (hour >= 18 && hour < 22) emoji = "🌇";
  else if (hour >= 22 || hour < 6) emoji = "🌙";

  const paddedHour = hour.toString().padStart(2, "0");
  const paddedMinute = minute.toString().padStart(2, "0");

  return `${emoji} ${paddedHour}:${paddedMinute}`;
}

/**
 * Safely formats the game date into a readable string (e.g., "01.08.3").
 * Calculates the current season based on the in-game moon (month).
 *
 * @param {any} rawDate - Raw game date object from getDate().
 * @param {any} vTime - Raw virtual time object from getVirtualTime().
 * @returns {string} Formatted date string or fallback text.
 */
function formatGameDate(rawDate, vTime) {
  let year, moon, date;

  if (rawDate && typeof rawDate.year === "number") {
    year = rawDate.year;
    moon = rawDate.moon;
    date = rawDate.date;
  } else if (
    rawDate &&
    Array.isArray(rawDate.value) &&
    rawDate.value.length >= 5
  ) {
    year = rawDate.value[0];
    moon = rawDate.value[1];
    date = rawDate.value[2];
  } else if (
    vTime &&
    vTime.virtualDate &&
    Array.isArray(vTime.virtualDate.value)
  ) {
    year = vTime.virtualDate.value[0];
    moon = vTime.virtualDate.value[1];
    date = vTime.virtualDate.value[2];
  } else {
    return "📅 Sync...";
  }

  let emoji = "📅";
  if (moon === 11 || moon === 0 || moon === 1) emoji = "❄️";
  else if (moon >= 2 && moon <= 4) emoji = "🌸";
  else if (moon >= 5 && moon <= 7) emoji = "☀️";
  else if (moon >= 8 && moon <= 10) emoji = "🍁";

  const formattedDate = String(date + 1).padStart(2, "0");
  const formattedMoon = String(moon + 1).padStart(2, "0");
  const formattedYear = String(year + 1);

  return `${emoji} ${formattedDate}.${formattedMoon}.${formattedYear}`;
}

/**
 * Injects the custom time display into the game's top-right HUD.
 * Connects to the unsafeWindow API to pull real-time game data gracefully.
 */
function initTimeHUD() {
  const targetSelector = ".MuiStack-root.css-1byqyzy";
  logger.log(
    `[CWG-Bamboo] Searching for target HUD container: "${targetSelector}"`,
  );

  setupSingleCallback(targetSelector, (targetContainer) => {
    logger.log(
      "[CWG-Bamboo] Target HUD container found! Injecting glass panel...",
    );

    if (document.getElementById("cwg-bamboo-time")) {
      return;
    }

    const timeElement = document.createElement("div");
    timeElement.className = "glass-panel glass-hud-item";
    timeElement.id = "cwg-bamboo-time";
    timeElement.innerText = "⏳ Sync...";

    targetContainer.appendChild(timeElement);
    logger.log("[CWG-Bamboo] Glass panel successfully attached to the DOM.");

    const gameWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    const intervalId = setInterval(() => {
      if (!timeElement.isConnected) {
        clearInterval(intervalId);
        return;
      }

      try {
        if (gameWindow.CWGPlayground) {
          const rawDate =
            typeof gameWindow.CWGPlayground.getDate === "function"
              ? gameWindow.CWGPlayground.getDate()
              : null;
          const vTime =
            typeof gameWindow.CWGPlayground.getVirtualTime === "function"
              ? gameWindow.CWGPlayground.getVirtualTime()
              : null;

          timeElement.innerText = formatGameTime(rawDate, vTime);
        }
      } catch (err) {
        timeElement.innerText = "⚠️ Err";
      }
    }, 1000);
  });
}

/**
 * Injects the custom date display into the game's top-right HUD.
 */
function initDateHUD() {
  if (!bambooSettings.showDateHUD) return;

  const targetSelector = ".MuiStack-root.css-1byqyzy";
  setupSingleCallback(targetSelector, (targetContainer) => {
    if (document.getElementById("cwg-bamboo-date")) return;

    const dateElement = document.createElement("div");
    dateElement.className = "glass-panel glass-hud-item";
    dateElement.id = "cwg-bamboo-date";
    dateElement.innerText = "📅 Sync...";

    const timeElement = document.getElementById("cwg-bamboo-time");
    if (timeElement) {
      targetContainer.insertBefore(dateElement, timeElement);
    } else {
      targetContainer.appendChild(dateElement);
    }

    const gameWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    const intervalId = setInterval(() => {
      if (!dateElement.isConnected) {
        clearInterval(intervalId);
        return;
      }

      try {
        if (gameWindow.CWGPlayground) {
          const rawDate =
            typeof gameWindow.CWGPlayground.getDate === "function"
              ? gameWindow.CWGPlayground.getDate()
              : null;
          const vTime =
            typeof gameWindow.CWGPlayground.getVirtualTime === "function"
              ? gameWindow.CWGPlayground.getVirtualTime()
              : null;

          dateElement.innerText = formatGameDate(rawDate, vTime);
        }
      } catch (err) {
        dateElement.innerText = "⚠️ Err";
      }
    }, 1000);
  });
}

/**
 * Resolves the localized name and extra info of the current area from hidden native DOM structures.
 *
 * @returns {{text: string, extraInfo: string|null}|null} Location data object, or null if not resolved.
 */
function getNativeLocationData() {
  const parent =
    document.getElementById("bamboo-native-bubble-stack") ||
    tagNativeLocationStack();

  if (parent) {
    const innerLocationStack = parent.querySelector(".MuiStack-root");
    if (innerLocationStack) {
      const span = innerLocationStack.querySelector("span");
      const extraBox = innerLocationStack.querySelector("div[aria-label]");

      if (span) {
        return {
          text: span.textContent.trim(),
          extraInfo: extraBox
            ? extraBox.getAttribute("aria-label").trim()
            : null,
        };
      }
    }
  }
  return null;
}

/**
 * Maps native location extra info to a corresponding emoji.
 *
 * @param {string|null} extraInfo - The aria-label text from the location.
 * @returns {string} The matched emoji or default pin.
 */
function getLocationEmoji(extraInfo) {
  if (!extraInfo) return "-";

  const info = extraInfo.toLowerCase();
  if (info.includes("бабочк")) return "🦋";

  return "✨";
}

/**
 * Injects a glass-styled location panel into the right-hand HUD area.
 * Keeps the state in sync with the hidden original layout.
 */
function initLocationHUD() {
  if (!bambooSettings.showLocationHUD) return;

  const targetSelector = ".MuiStack-root.css-1byqyzy";
  setupSingleCallback(targetSelector, (targetContainer) => {
    if (document.getElementById("cwg-bamboo-location")) return;

    const locElement = document.createElement("div");
    locElement.className = "glass-panel glass-hud-item";
    locElement.id = "cwg-bamboo-location";
    locElement.innerText = "📍 Sync...";

    const timeElement = document.getElementById("cwg-bamboo-time");
    if (timeElement) {
      targetContainer.insertBefore(locElement, timeElement);
    } else {
      targetContainer.appendChild(locElement);
    }

    document.body.classList.add("bamboo-hide-native-location");

    const intervalId = setInterval(() => {
      if (!locElement.isConnected) {
        clearInterval(intervalId);
        return;
      }

      try {
        const data = getNativeLocationData();

        if (data && data.text) {
          const emoji = getLocationEmoji(data.extraInfo);
          locElement.innerText = `${emoji} ${data.text}`;

          if (data.extraInfo) {
            locElement.title = data.extraInfo;
            locElement.style.cursor = "help";
          } else {
            locElement.removeAttribute("title");
            locElement.style.cursor = "default";
          }
        } else {
          locElement.innerText = "📍 Sync...";
          locElement.removeAttribute("title");
          locElement.style.cursor = "default";
        }
      } catch (err) {
        locElement.innerText = "⚠️ Err";
      }
    }, 1000);
  });
}

/**
 * Triggers the user-defined audio notification for event updates.
 */
function triggerEventSoundNotification() {
  if (!bambooSettings.enableEventNotification) return;

  const soundId = bambooSettings.eventNotificationSound;
  const volume = bambooSettings.eventNotificationVolume || 5;

  if (soundId) {
    soundManager
      .playSound(soundId, volume)
      .then(() => {
        logger.log(
          "[CWG-Bamboo] Played event notification sound successfully.",
        );
      })
      .catch((err) => {
        logger.error(
          "[CWG-Bamboo] Failed to play event notification sound:",
          err,
        );
      });
  }
}

/**
 * Initializes the dynamic event notification observer using setupMutationObserver.
 * Leverages the `:has()` pseudo-class to target the parent container safely.
 */
function initEventNotificationObserver() {
  const parentSelector = 'div:has(> button[aria-label="open events"])';
  let isEventBadgeActive = false;

  const handleEventBadgeMutation = () => {
    const badge = document.querySelector(
      'button[aria-label="open events"] ~ div',
    );
    const isVisible =
      !!badge &&
      window.getComputedStyle(badge).display !== "none" &&
      window.getComputedStyle(badge).visibility !== "hidden";

    if (isVisible) {
      if (!isEventBadgeActive) {
        isEventBadgeActive = true;
        triggerEventSoundNotification();
      }
    } else {
      isEventBadgeActive = false;
    }
  };

  setupMutationObserver(
    parentSelector,
    handleEventBadgeMutation,
    {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    },
    20,
    500,
    150,
  );
}

// ====================================================================================================================
//   . . . BAMBOO CHAT . . .
// ====================================================================================================================

/**
 * Centrally processes incoming raw system notification events (like dice rolls or error alerts)
 * and routes them to the customized Improved Chat container.
 * Decouples raw event parsing (WebSocket hooks) from direct UI DOM operations.
 *
 * @param {string} message - The raw system message payload string extracted from network events.
 */
function dispatchSystemNotification(message) {
  if (bambooSettings.enableBambooChat) {
    addMessageToBambooChat(null, message, true);
  }
}

/**
 * Binds click listeners to chat header tabs to filter displayed messages dynamically.
 *
 * @param {HTMLElement} chatPanel - The main chat container.
 */
function bindChatTabs(chatPanel) {
  const tabs = chatPanel.querySelectorAll(".bamboo-chat-tab");
  const msgContainer = chatPanel.querySelector("#cwg-bamboo-chat-messages");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const tabType = tab.dataset.tab;
      if (tabType === "system") {
        msgContainer.classList.add("show-only-system");
      } else {
        msgContainer.classList.remove("show-only-system");
      }

      msgContainer.scrollTop = msgContainer.scrollHeight;
    });
  });
}

/**
 * Toggles the visibility of the custom Improved Chat panel.
 */
function toggleBambooChat() {
  const chatPanel = document.getElementById("cwg-bamboo-chat");
  if (!chatPanel) return;
  chatPanel.style.display =
    chatPanel.style.display === "none" ? "flex" : "none";
}

/**
 * Injects the custom Improved Chat panel into the DOM.
 */
function initBambooChat() {
  if (!bambooSettings.enableBambooChat) return;

  if (document.getElementById("cwg-bamboo-chat")) return;

  const chatPanel = document.createElement("div");
  chatPanel.className = "glass-panel";
  chatPanel.id = "cwg-bamboo-chat";
  chatPanel.style.display = "none";

  const savedHeight = bambooSettings.bambooChatHeight || 450;
  chatPanel.style.height = `${savedHeight}px`;

  chatPanel.innerHTML = `
    <div class="bamboo-chat-header">
      <div class="bamboo-chat-tabs">
        <span class="bamboo-chat-tab active" data-tab="local">Локальный чат</span>
        <span class="bamboo-chat-tab" data-tab="system">Системные</span>
      </div>
      <div class="bamboo-resize-handle" title="Растянуть вверх/вниз">↕</div>
    </div>
    <div id="cwg-bamboo-chat-messages"></div>
  `;

  document.body.appendChild(chatPanel);
  logger.log("[CWG-Bamboo] Custom Improved Chat successfully injected.");

  const handle = chatPanel.querySelector(".bamboo-resize-handle");
  makeChatResizable(chatPanel, handle);

  bindChatTabs(chatPanel);

  observeNativeChat();

  document.addEventListener(
    "click",
    (e) => {
      if (!bambooSettings.enableBambooChat) return;

      const nativeChatBtn = e.target.closest(
        'button[aria-label="open chat"], button[title="Чат"]',
      );
      if (nativeChatBtn) {
        e.stopPropagation();
        e.preventDefault();
        toggleBambooChat();
      }
    },
    true,
  );
}

/**
 * Hooks into the prototype of the game's Cat entity to intercept peer chat events.
 * Correctly maps parameters to resolve the issue where IDs were displayed as messages.
 */
async function hookChatEngine() {
  const gameWindow =
    typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  let me = null;

  logger.log(
    "[CWG-Bamboo] Waiting for controllable entity to spawn before hooking speech...",
  );

  while (!me) {
    if (
      gameWindow.CWGPlayground &&
      typeof gameWindow.CWGPlayground.me === "function"
    ) {
      me = gameWindow.CWGPlayground.me();
    }
    if (!me) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const CatProto = Object.getPrototypeOf(me);

  if (
    CatProto &&
    typeof CatProto.say === "function" &&
    !CatProto.say.__bambooHooked
  ) {
    const originalSay = CatProto.say;

    CatProto.say = function (message) {
      try {
        if (bambooSettings.enableBambooChat) {
          const myId = gameWindow.CWGPlayground?.me()?.id;
          const isMe = this.id === myId;

          addMessageToBambooChat(
            this.name || "Неизвестный",
            message,
            false,
            isMe,
          );
        }
      } catch (err) {
        logger.error("[CWG-Bamboo] Error in hooked say():", err);
      }
      return originalSay.apply(this, arguments);
    };

    CatProto.say.__bambooHooked = true;
    logger.log(
      "[CWG-Bamboo] Native Cat.say() successfully patched! Backup speech interceptor is live.",
    );
  }
}

/**
 * Appends a formatted message bubble to the custom Bamboo Chat.
 * Handles styling separation for system notices, self-sent, and peer messages.
 *
 * @param {string|null} author - The sender's nickname. Set to null for system messages.
 * @param {string} text - The raw message payload.
 * @param {boolean} [isSystem=false] - Whether this is an in-game system notification.
 * @param {boolean} [isMe=false] - Whether the message originates from the local player.
 */
function addMessageToBambooChat(author, text, isSystem = false, isMe = false) {
  const msgContainer = document.getElementById("cwg-bamboo-chat-messages");
  if (!msgContainer) return;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let messageHTML = "";

  if (isSystem) {
    messageHTML = `
      <div class="bamboo-chat-msg system">
        <span class="time">[${timeStr}]</span>
        <span class="text">${text}</span>
      </div>
    `;
  } else {
    const selfClass = isMe ? " self" : "";
    messageHTML = `
      <div class="bamboo-chat-msg${selfClass}">
        <span class="time">[${timeStr}]</span>
        <span class="author">${author}</span>: 
        <span class="text">${text}</span>
      </div>
    `;
  }

  msgContainer.insertAdjacentHTML("beforeend", messageHTML);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

/**
 * Monitors the native (hidden) chat UI for changes.
 * Integrates intercepted messages into the custom chat while maintaining visual alignment.
 */
function observeNativeChat() {
  const nativeDrawerSelector = ".MuiDrawer-root";
  logger.log(
    `[CWG-Bamboo] Setting up native chat observer on: "${nativeDrawerSelector}"`,
  );

  setupSingleCallback(nativeDrawerSelector, (drawer) => {
    logger.log(
      "[CWG-Bamboo] Target MuiDrawer-root found! Hiding and hooking MutationObserver...",
    );

    document.body.classList.add("bamboo-hide-native-chat");

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;

            const authorSpan = node.querySelector("span");
            const textParagraph = node.querySelector("p");

            if (authorSpan && textParagraph) {
              const author = authorSpan.textContent.trim();
              const text = textParagraph.textContent.trim();

              const gameWindow =
                typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
              const myName = gameWindow.CWGPlayground?.me()?.name;
              const isMe = author === myName;

              addMessageToBambooChat(author, text, false, isMe);
            } else {
              const systemSpan = node.querySelector("span");
              if (systemSpan) {
                const text = systemSpan.textContent.trim();

                if (
                  text !== "События" &&
                  text !== "Локальный чат" &&
                  text !== "Чат" &&
                  text !== "Мяукни что-нибудь"
                ) {
                  addMessageToBambooChat(null, text, true);
                }
              }
            }
          });
        }
      });
    });

    observer.observe(drawer, {
      childList: true,
      subtree: true,
    });

    logger.log(
      "[CWG-Bamboo] MutationObserver successfully hooked to native hidden chat.",
    );
  });
}

/**
 * Attaches mouse dragging event listeners to enable vertical resizing of the chat panel.
 * Limits resizing boundaries and debounces writing to storage.
 *
 * @param {HTMLElement} chatPanel - The main chat overlay container.
 * @param {HTMLElement} handle - The resize anchor element inside the panel.
 */
function makeChatResizable(chatPanel, handle) {
  let startY = 0;
  let startHeight = 0;

  const debouncedSaveHeight = debounce((height) => {
    bambooSettings.bambooChatHeight = height;
    saveSettings();
    logger.log("[CWG-Bamboo] Chat height saved successfully:", height);
  }, 300);

  function onMouseDown(e) {
    e.preventDefault();
    startY = e.clientY;
    startHeight = chatPanel.offsetHeight;

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    const deltaY = startY - e.clientY;
    let newHeight = startHeight + deltaY;

    const minHeight = 150;
    const maxHeight = Math.min(1200, window.innerHeight - 120);

    if (newHeight < minHeight) newHeight = minHeight;
    if (newHeight > maxHeight) newHeight = maxHeight;

    chatPanel.style.height = `${newHeight}px`;

    debouncedSaveHeight(newHeight);
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  handle.addEventListener("mousedown", onMouseDown);
}

// ====================================================================================================================
//   . . . ACTION HOTBAR LOGIC . . .
// ====================================================================================================================

function initHotbarActions() {
  hotbarManager.registerAction("action_sit", "🐾", "Сесть", () => {
    networkManager.sendPacket({ code: 2021 });
  });

  hotbarManager.registerAction("action_sleep", "💤", "Спать", () => {
    networkManager.sendPacket({ code: 2016, payload: {} });
  });

  hotbarManager.registerAction("action_lick_self", "🩹", "Вылизаться", () => {
    const gameWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const me = gameWindow.CWGPlayground?.me();

    if (me && me.id) {
      networkManager.sendPacket({ code: 2012, payload: { licked: me.id } });
    } else {
      logger.warn("[CWG-Bamboo] Unable to get your ID for licking.");
    }
  });
}

// ====================================================================================================================
//   . . . ACTION HOTBAR MANAGEMENT . . .
// ====================================================================================================================

const hotbarManager = {
  actions: [],

  /**
   * Registers a new button in the hotbar.
   * @param {string} id - Unique identifier
   * @param {string} icon - Emoji or icon text
   * @param {string} label - Icon caption
   * @param {Function} callback - Function called on click
   */
  registerAction: function (id, icon, label, callback) {
    const existing = this.actions.find((a) => a.id === id);
    if (existing) {
      existing.icon = icon;
      existing.label = label;
      existing.callback = callback;
    } else {
      this.actions.push({ id, icon, label, callback, disabled: false });
    }
    this.render();
  },

  /**
   * Locks or unlocks a button (e.g., when the action is impossible).
   */
  setDisabled: function (id, isDisabled) {
    const action = this.actions.find((a) => a.id === id);
    if (action && action.disabled !== isDisabled) {
      action.disabled = isDisabled;
      this.render();
    }
  },

  /**
   * Re-renders the hotbar.
   */
  render: function () {
    const container = document.getElementById("cwg-bamboo-hotbar");
    if (!container) return;

    container.innerHTML = "";

    if (this.actions.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "bamboo-hotbar-btn disabled";
      placeholder.title = "Пока нет доступных действий";
      placeholder.innerHTML = `
        <div class="bamboo-hotbar-icon">🫙</div>
        <div class="bamboo-hotbar-label">Пусто :(</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    this.actions.forEach((action) => {
      const btn = document.createElement("div");
      btn.className =
        "bamboo-hotbar-btn" + (action.disabled ? " disabled" : "");
      btn.title = action.label;
      btn.innerHTML = `
        <div class="bamboo-hotbar-icon">${action.icon}</div>
        <div class="bamboo-hotbar-label">${action.label}</div>
      `;

      btn.addEventListener("click", () => {
        if (!action.disabled && typeof action.callback === "function") {
          action.callback();
        }
      });

      container.appendChild(btn);
    });
  },
};

/**
 * Initializes and embeds the action bar into the DOM.
 */
function initHotbarHUD() {
  if (!bambooSettings.showActionHotbar) return;
  if (document.getElementById("cwg-bamboo-hotbar")) return;

  const hotbar = document.createElement("div");
  hotbar.id = "cwg-bamboo-hotbar";
  hotbar.className = "glass-panel";
  document.body.appendChild(hotbar);

  hotbarManager.render();
  logger.log("[CWG-Bamboo] Action Hotbar initialized.");

  initHotbarActions();
}

// ====================================================================================================================
//   . . . PAGE ROUTERS (TABLE OF CONTENTS) . . .
// ====================================================================================================================

/**
 * Initializes and manages features designed strictly for the Play Page.
 * Runs only enabled features to save resources and keep DOM clean.
 */
function initPlayPage() {
  logger.log("[CWG-Bamboo] Initializing Play Page Router...");

  tagNativeLocationStack();

  if (bambooSettings.showTimeHUD) {
    initTimeHUD();
  }

  if (bambooSettings.showDateHUD) {
    initDateHUD();
  }

  if (bambooSettings.showLocationHUD) {
    initLocationHUD();
  }

  if (bambooSettings.showActionHotbar) {
    initHotbarHUD();
  }

  if (bambooSettings.enableBambooChat) {
    document.body.classList.add("bamboo-hide-native-bubbles");
    initBambooChat();
    hookChatEngine();
  }

  initSettingsButton();
  initEventNotificationObserver();
}

// ====================================================================================================================
//   . . . INITIALIZATION . . .
// ====================================================================================================================

async function initMod() {
  logger.log("[CWG Mod] Initializing...");

  loadSettings();
  loadCustomSounds();

  applyBambooTheme();

  injectCustomStyles();
  createSettingsModal();

  await waitForPlayground();
  logger.log("[CWG Mod] CWGPlayground API detected!");

  initPlayPage();
}

initMod();
