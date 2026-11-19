const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("API_BASE", "http://127.0.0.1:8000");
contextBridge.exposeInMainWorld("WS_BASE", "ws://127.0.0.1:8000");
