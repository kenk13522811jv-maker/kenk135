// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from "firebase/firestore";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
var APPS_DIR = path.resolve(process.cwd(), "uploads", "apps");
try {
  fs.mkdirSync(APPS_DIR, { recursive: true });
} catch {
}
var firebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0536368169",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:324552210220:web:b11d8cc1636bcad38f5e89",
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyAQ5V8D9oSjRiNSDppXHPN-NqXm0lnEE0Y",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0536368169.firebaseapp.com",
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-cloudflarer2file-8229099a-1e66-456d-b761-d252780131eb",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0536368169.firebasestorage.app"
};
var fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
var fbDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);
function withTimeout(promise, ms = 3e3, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }
  // 150MB per file
});
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true, limit: "150mb" }));
function computeExpiresAt(retention, now) {
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  if (retention === "1day") return now + ONE_DAY;
  if (retention === "2days") return now + 2 * ONE_DAY;
  if (retention === "3days") return now + 3 * ONE_DAY;
  return null;
}
var mediaMemoryCache = /* @__PURE__ */ new Map();
function pruneMemoryCache() {
  if (mediaMemoryCache.size > 150) {
    const keys = Array.from(mediaMemoryCache.keys());
    for (let i = 0; i < 30; i++) {
      mediaMemoryCache.delete(keys[i]);
    }
  }
}
var notesMemoryCache = /* @__PURE__ */ new Map();
function pruneNotesCache() {
  if (notesMemoryCache.size > 200) {
    const keys = Array.from(notesMemoryCache.keys());
    for (let i = 0; i < 50; i++) {
      notesMemoryCache.delete(keys[i]);
    }
  }
}
var appsMemoryCache = /* @__PURE__ */ new Map();
function pruneAppsCache() {
  if (appsMemoryCache.size > 60) {
    const keys = Array.from(appsMemoryCache.keys());
    for (let i = 0; i < 15; i++) {
      appsMemoryCache.delete(keys[i]);
    }
  }
}
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }
    const retention = req.body.retention || "permanent";
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const safeBase = req.file.originalname.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
    const id = `asset_${now}_${Math.random().toString(36).substring(2, 7)}_${safeBase || "item"}`;
    const isVideo = req.file.mimetype.startsWith("video/");
    const category = isVideo ? "video" : "image";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/api/public/${id}`;
    mediaMemoryCache.set(id, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      name: req.file.originalname,
      expiresAt: expiresAt || 0
    });
    pruneMemoryCache();
    const base64Data = req.file.buffer.toString("base64");
    const CHUNK_SIZE = 4e5;
    const needsChunking = base64Data.length > 6e5;
    const chunksCount = needsChunking ? Math.ceil(base64Data.length / CHUNK_SIZE) : 0;
    const newAsset = {
      id,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      category,
      publicUrl,
      storagePath: `firestore_assets/${id}`,
      storageProvider: "firestore-embedded",
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      hasChunks: needsChunking,
      chunksCount,
      dataUrl: needsChunking ? "" : `data:${req.file.mimetype};base64,${base64Data}`
    };
    if (needsChunking) {
      const chunkWrites = [];
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunkWrites.push(
          setDoc(doc(fbDb, "assets", id, "chunks", `chunk_${i}`), {
            chunkIndex: i,
            data: chunkData
          })
        );
      }
      await Promise.all(chunkWrites);
    }
    await setDoc(doc(fbDb, "assets", id), newAsset);
    console.log(`[Firebase Firestore] Successfully saved asset "${req.file.originalname}" (${req.file.size} bytes) to assets/${id}${needsChunking ? ` with ${chunksCount} chunks` : ""}`);
    return res.json({
      success: true,
      asset: {
        id,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        category,
        publicUrl,
        storageKey: `firestore_assets/${id}`,
        storageProvider: "firestore-embedded",
        uploadedAt: now,
        expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: publicUrl
      }
    });
  } catch (err) {
    console.error("Upload to Firestore failed:", err);
    return res.status(500).json({ error: `Firebase save failed: ${err.message || "Unknown error"}` });
  }
});
app.post("/api/upload-url", async (req, res) => {
  try {
    const { url, retention = "permanent" } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const id = `asset_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const isVideo = Boolean(url.match(/\.(mp4|webm|mov|ogg)($|\?)/i));
    const category = isVideo ? "video" : "image";
    let parsedName = "online-media.jpg";
    try {
      const urlObj = new URL(url);
      const lastPart = urlObj.pathname.split("/").pop();
      if (lastPart && lastPart.includes(".")) {
        parsedName = decodeURIComponent(lastPart.split("?")[0]);
      }
    } catch {
    }
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/api/public/${id}`;
    let fetchedBuffer = null;
    let fetchedMime = isVideo ? "video/mp4" : "image/jpeg";
    let fetchedSize = 1024 * 512;
    try {
      const fetchRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      if (fetchRes.ok) {
        const arrayBuf = await fetchRes.arrayBuffer();
        fetchedBuffer = Buffer.from(arrayBuf);
        fetchedSize = fetchedBuffer.length;
        const cType = fetchRes.headers.get("content-type");
        if (cType) fetchedMime = cType.split(";")[0];
      }
    } catch (fetchErr) {
      console.warn("Could not download external URL buffer, saving URL reference:", fetchErr);
    }
    if (fetchedBuffer) {
      mediaMemoryCache.set(id, {
        buffer: fetchedBuffer,
        mimeType: fetchedMime,
        name: parsedName,
        expiresAt: expiresAt || 0
      });
      pruneMemoryCache();
      const base64Data = fetchedBuffer.toString("base64");
      const CHUNK_SIZE = 4e5;
      const needsChunking = base64Data.length > 6e5;
      const chunksCount = needsChunking ? Math.ceil(base64Data.length / CHUNK_SIZE) : 0;
      if (needsChunking) {
        const chunkWrites = [];
        for (let i = 0; i < chunksCount; i++) {
          const chunkData = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          chunkWrites.push(
            setDoc(doc(fbDb, "assets", id, "chunks", `chunk_${i}`), {
              chunkIndex: i,
              data: chunkData
            })
          );
        }
        await Promise.all(chunkWrites);
      }
      const newAsset = {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl,
        storagePath: `firestore_assets/${id}`,
        storageProvider: "firestore-embedded",
        uploadedAt: now,
        expiresAt: expiresAt || 0,
        retention,
        isExpired: false,
        hasChunks: needsChunking,
        chunksCount,
        dataUrl: needsChunking ? "" : `data:${fetchedMime};base64,${base64Data}`
      };
      await setDoc(doc(fbDb, "assets", id), newAsset);
    } else {
      const newAsset = {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl: url,
        storagePath: `firestore_assets/${id}`,
        storageProvider: "firestore-embedded",
        uploadedAt: now,
        expiresAt: expiresAt || 0,
        retention,
        isExpired: false,
        dataUrl: url,
        hasChunks: false,
        chunksCount: 0
      };
      await setDoc(doc(fbDb, "assets", id), newAsset);
    }
    return res.json({
      success: true,
      asset: {
        id,
        name: parsedName,
        size: fetchedSize,
        type: fetchedMime,
        category,
        publicUrl,
        storageKey: `firestore_assets/${id}`,
        storageProvider: "firestore-embedded",
        uploadedAt: now,
        expiresAt,
        retention,
        isExpired: false,
        downloadsCount: 0,
        thumbnailUrl: publicUrl
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "URL ingestion failed" });
  }
});
app.all("/api/public/:id", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).send("Method Not Allowed");
  }
  try {
    const { id } = req.params;
    const now = Date.now();
    const cached = mediaMemoryCache.get(id);
    if (cached) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) {
        mediaMemoryCache.delete(id);
        deleteDoc(doc(fbDb, "assets", id)).catch(() => {
        });
        return res.status(404).send("Asset expired according to retention policy");
      }
      res.setHeader("Content-Type", cached.mimeType || "image/jpeg");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(cached.name || "media")}"`);
      res.setHeader("Content-Length", cached.buffer.length);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      if (req.method === "HEAD") {
        return res.end();
      }
      return res.end(cached.buffer);
    }
    const docSnap = await getDoc(doc(fbDb, "assets", id));
    if (!docSnap.exists()) {
      return res.status(404).send("Asset not found or expired in Firebase");
    }
    const data = docSnap.data();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, "assets", id)).catch(() => {
      });
      return res.status(404).send("Asset expired according to retention policy");
    }
    if (data.dataUrl && data.dataUrl.startsWith("data:")) {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        mediaMemoryCache.set(id, {
          buffer,
          mimeType,
          name: data.name || "file",
          expiresAt: data.expiresAt || 0
        });
        pruneMemoryCache();
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(data.name || "media")}"`);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        if (req.method === "HEAD") {
          return res.end();
        }
        return res.end(buffer);
      }
    }
    if (data.hasChunks && data.chunksCount > 0) {
      const chunkPromises = [];
      for (let i = 0; i < data.chunksCount; i++) {
        chunkPromises.push(getDoc(doc(fbDb, "assets", id, "chunks", `chunk_${i}`)));
      }
      const chunkDocs = await Promise.all(chunkPromises);
      let fullBase64 = "";
      for (const cDoc of chunkDocs) {
        if (cDoc.exists()) {
          fullBase64 += cDoc.data()?.data || "";
        }
      }
      if (fullBase64.length > 0) {
        const buffer = Buffer.from(fullBase64, "base64");
        const mimeType = data.type || "image/jpeg";
        mediaMemoryCache.set(id, {
          buffer,
          mimeType,
          name: data.name || "media",
          expiresAt: data.expiresAt || 0
        });
        pruneMemoryCache();
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(data.name || "media")}"`);
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        if (req.method === "HEAD") {
          return res.end();
        }
        return res.end(buffer);
      }
    }
    if (data.publicUrl && data.publicUrl.startsWith("http") && !data.publicUrl.includes(`/api/public/${id}`)) {
      return res.redirect(data.publicUrl);
    }
    return res.status(404).send("Media payload unavailable or missing in Firebase");
  } catch (err) {
    console.error("Error serving asset from Firestore:", err);
    return res.status(500).send("Internal server error retrieving file from Firebase");
  }
});
app.get("/api/files", async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, "assets"));
    const now = Date.now();
    const items = snapshot.docs.map((d) => {
      const data = d.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      return {
        id: data.id || d.id,
        name: data.name,
        size: data.size,
        type: data.type,
        category: data.category || (data.type?.startsWith("video/") ? "video" : "image"),
        publicUrl: data.publicUrl,
        storageKey: data.storagePath || `firestore_assets/${data.id}`,
        storageProvider: data.storageProvider || "firestore-embedded",
        uploadedAt: Number(data.uploadedAt),
        expiresAt,
        retention: data.retention || (expiresAt ? "1day" : "permanent"),
        isExpired: expiresAt ? now > expiresAt : false,
        downloadsCount: 0,
        thumbnailUrl: data.publicUrl
      };
    }).sort((a, b) => b.uploadedAt - a.uploadedAt);
    return res.json(items);
  } catch (err) {
    console.error("Error reading assets from Firestore:", err);
    return res.json([]);
  }
});
app.delete("/api/files/:id", async (req, res) => {
  try {
    const { id } = req.params;
    mediaMemoryCache.delete(id);
    const docSnap = await getDoc(doc(fbDb, "assets", id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.hasChunks && data.chunksCount > 0) {
        const chunkDeletes = [];
        for (let i = 0; i < data.chunksCount; i++) {
          chunkDeletes.push(deleteDoc(doc(fbDb, "assets", id, "chunks", `chunk_${i}`)).catch(() => {
          }));
        }
        await Promise.all(chunkDeletes);
      }
    }
    await deleteDoc(doc(fbDb, "assets", id));
    console.log(`[Firebase Firestore] Deleted asset ${id}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete from Firebase" });
  }
});
app.post("/api/cleanup", async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, "assets"));
    const now = Date.now();
    let cleaned = 0;
    for (const d of snapshot.docs) {
      const data = d.data();
      if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
        await deleteDoc(doc(fbDb, "assets", d.id));
        cleaned++;
      }
    }
    return res.json({ success: true, cleaned });
  } catch {
    return res.json({ success: true, cleaned: 0 });
  }
});
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function isAICrawlerOrTool(req) {
  const ua = (req.get("user-agent") || "").toLowerCase();
  const accept = (req.get("accept") || "").toLowerCase();
  if (req.query.raw === "1" || req.query.raw === "true") return true;
  if (accept.includes("text/plain") && !accept.includes("text/html")) return true;
  const botSignatures = [
    "gptbot",
    "chatgpt-user",
    "chatgpt",
    "openai",
    "claude-web",
    "claudebot",
    "anthropic",
    "perplexitybot",
    "perplexity",
    "google-extended",
    "googlebot",
    "bytespider",
    "python-requests",
    "python",
    "curl",
    "wget",
    "httpie",
    "postman",
    "aiohttp",
    "node-fetch",
    "axios",
    "go-http-client",
    "urllib",
    "scrapy"
  ];
  return botSignatures.some((sig) => ua.includes(sig));
}
async function loadFullNote(id) {
  const now = Date.now();
  const cached = notesMemoryCache.get(id);
  if (cached) {
    if (cached.expiresAt && cached.expiresAt > 0 && now > cached.expiresAt) {
      notesMemoryCache.delete(id);
      deleteDoc(doc(fbDb, "notes", id)).catch(() => {
      });
      return null;
    }
    return cached;
  }
  const docSnap = await getDoc(doc(fbDb, "notes", id));
  if (!docSnap.exists()) {
    return null;
  }
  const data = docSnap.data();
  if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
    deleteDoc(doc(fbDb, "notes", id)).catch(() => {
    });
    return null;
  }
  let fullContent = data.content || "";
  if (data.hasChunks && data.chunksCount > 0) {
    try {
      const chunksSnap = await getDocs(collection(fbDb, "notes", id, "chunks"));
      const chunkDocs = chunksSnap.docs.map((c) => c.data()).sort((a, b) => a.chunkIndex - b.chunkIndex);
      fullContent = chunkDocs.map((c) => c.data || "").join("");
    } catch (cErr) {
      console.error(`Error loading chunks for note ${id}:`, cErr);
    }
  }
  const assembledNote = {
    id: data.id || id,
    title: data.title || "Untitled Note",
    content: fullContent,
    size: data.size || Buffer.byteLength(fullContent, "utf8"),
    createdAt: Number(data.createdAt || now),
    updatedAt: Number(data.updatedAt || now),
    expiresAt: Number(data.expiresAt || 0),
    retention: data.retention || "permanent",
    isExpired: false,
    publicUrl: data.publicUrl || "",
    rawUrl: data.rawUrl || "",
    hasChunks: Boolean(data.hasChunks),
    chunksCount: data.chunksCount || 0
  };
  notesMemoryCache.set(id, assembledNote);
  pruneNotesCache();
  return assembledNote;
}
app.post("/api/notes", async (req, res) => {
  try {
    const { title = "", content = "", retention = "permanent" } = req.body;
    if (typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "Note content cannot be empty" });
    }
    const cleanContent = content.replace(/\s+$/, "");
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const id = `note_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const finalTitle = title && typeof title === "string" && title.trim().length > 0 ? title.trim().slice(0, 150) : "Untitled Note";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/note?id=${id}`;
    const rawUrl = `${protocol}://${host}/note/raw/${id}`;
    const byteSize = Buffer.byteLength(cleanContent, "utf8");
    const CHUNK_SIZE = 4e5;
    const needsChunking = cleanContent.length > 5e5;
    const chunksCount = needsChunking ? Math.ceil(cleanContent.length / CHUNK_SIZE) : 0;
    const noteDoc = {
      id,
      title: finalTitle,
      content: needsChunking ? cleanContent.slice(0, 1e5) : cleanContent,
      size: byteSize,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      publicUrl,
      rawUrl,
      hasChunks: needsChunking,
      chunksCount
    };
    if (needsChunking) {
      const chunkWrites = [];
      for (let i = 0; i < chunksCount; i++) {
        const chunkData = cleanContent.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunkWrites.push(
          setDoc(doc(fbDb, "notes", id, "chunks", `chunk_${i}`), {
            chunkIndex: i,
            data: chunkData
          })
        );
      }
      await Promise.all(chunkWrites);
    }
    await setDoc(doc(fbDb, "notes", id), noteDoc);
    notesMemoryCache.set(id, {
      ...noteDoc,
      content: cleanContent
    });
    pruneNotesCache();
    console.log(`[Firebase Firestore] Note created: ${id} ("${finalTitle}") [Size: ${(byteSize / 1024).toFixed(1)} KB, Chunks: ${chunksCount}]`);
    return res.json({
      success: true,
      note: {
        ...noteDoc,
        content: cleanContent
      }
    });
  } catch (err) {
    console.error("Error creating note in Firestore:", err);
    return res.status(500).json({ error: err.message || "Failed to save note to Firebase" });
  }
});
app.get("/api/notes", async (_req, res) => {
  try {
    const snapshot = await getDocs(collection(fbDb, "notes"));
    const now = Date.now();
    const notes = [];
    for (const d of snapshot.docs) {
      const data = d.data();
      const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
      if (expiresAt && now > expiresAt) {
        deleteDoc(doc(fbDb, "notes", d.id)).catch(() => {
        });
        continue;
      }
      notes.push({
        id: data.id || d.id,
        title: data.title || "Untitled Note",
        content: data.content || "",
        size: data.size || Buffer.byteLength(data.content || "", "utf8"),
        createdAt: Number(data.createdAt || now),
        updatedAt: Number(data.updatedAt || now),
        expiresAt,
        retention: data.retention || (expiresAt ? "1day" : "permanent"),
        isExpired: false,
        publicUrl: data.publicUrl,
        rawUrl: data.rawUrl,
        hasChunks: Boolean(data.hasChunks),
        chunksCount: data.chunksCount || 0
      });
    }
    notes.sort((a, b) => b.createdAt - a.createdAt);
    return res.json(notes);
  } catch (err) {
    console.error("Error fetching notes from Firestore:", err);
    return res.json([]);
  }
});
app.get("/api/notes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found or expired" });
    }
    return res.json({ success: true, note });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch note" });
  }
});
app.delete("/api/notes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    notesMemoryCache.delete(id);
    try {
      const chunksSnap = await getDocs(collection(fbDb, "notes", id, "chunks"));
      const chunkDeletes = chunksSnap.docs.map((c) => deleteDoc(doc(fbDb, "notes", id, "chunks", c.id)));
      await Promise.all(chunkDeletes);
    } catch {
    }
    await deleteDoc(doc(fbDb, "notes", id));
    console.log(`[Firebase Firestore] Deleted note: ${id}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete note" });
  }
});
app.all(["/note/raw/:id", "/api/notes/:id/raw"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  try {
    const { id } = req.params;
    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).send("Note not found or expired");
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(note.content || "");
  } catch (err) {
    return res.status(500).send(`Error reading note: ${err.message}`);
  }
});
app.get(["/note", "/note/:id"], async (req, res, next) => {
  try {
    const id = (req.params.id || req.query.id || "").trim();
    if (!id) {
      return next();
    }
    const note = await loadFullNote(id);
    if (!note) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head><meta charset="utf-8"><title>Note Not Found</title></head>
        <body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
          <div style="text-align:center;">
            <h1 style="color:#f43f5e;margin-bottom:0.5rem;">404 - \u09A8\u09CB\u099F \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF</h1>
            <p style="color:#94a3b8;margin-bottom:1.5rem;">\u098F\u0987 \u09A8\u09CB\u099F\u099F\u09BF \u09AE\u09C1\u099B\u09C7 \u09AB\u09C7\u09B2\u09BE \u09B9\u09DF\u09C7\u099B\u09C7 \u0985\u09A5\u09AC\u09BE \u09AE\u09C7\u09DF\u09BE\u09A6\u09C7\u09B0 \u09B8\u09AE\u09DF \u09AA\u09BE\u09B0 \u09B9\u09DF\u09C7 \u0997\u09C7\u099B\u09C7\u0964</p>
            <a href="/" style="color:#f59e0b;text-decoration:none;font-weight:bold;">\u2190 \u09B9\u09CB\u09AE\u09AA\u09C7\u099C\u09C7 \u09AB\u09BF\u09B0\u09C7 \u09AF\u09BE\u09A8</a>
          </div>
        </body>
        </html>
      `);
    }
    if (isAICrawlerOrTool(req)) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.send(note.content || "");
    }
    const safeTitle = escapeHtml(note.title || "Untitled Note");
    const cleanContent = (note.content || "").replace(/\s+$/, "");
    const safeContent = escapeHtml(cleanContent);
    const dateFormatted = new Date(note.createdAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
    const wordCount = cleanContent.trim().split(/\s+/).filter(Boolean).length;
    const charCount = cleanContent.length;
    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} - Clean Note</title>
  <meta name="description" content="Clean, preformatted text note" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      margin: 0;
      padding: 0;
      line-height: 1.6;
      min-height: auto;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(3, 7, 18, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #1f2937;
      padding: 0.65rem 1.25rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .meta-left {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .badge {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.15rem 0.55rem;
      border-radius: 9999px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .note-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f9fafb;
    }
    .note-stats {
      font-size: 0.75rem;
      color: #9ca3af;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn {
      background: #1f2937;
      color: #f3f4f6;
      border: 1px solid #374151;
      border-radius: 0.5rem;
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn:hover {
      background: #374151;
      border-color: #4b5563;
      color: #ffffff;
    }
    .btn-primary {
      background: #f59e0b;
      border-color: #d97706;
      color: #030712;
      font-weight: 700;
    }
    .btn-primary:hover {
      background: #fbbf24;
      color: #030712;
    }
    .main-wrap {
      max-width: 1050px;
      width: 100%;
      margin: 0.75rem auto 1rem auto;
      padding: 0 1rem;
    }
    .note-box {
      background: #0b0f19;
      border: 1px solid #1f2937;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.6);
    }
    pre {
      margin: 0;
      padding: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
      font-size: 0.9rem;
      color: #e5e7eb;
      line-height: 1.65;
      tab-size: 4;
      outline: none;
    }
    .footer-notice {
      margin-top: 0.75rem;
      margin-bottom: 1.25rem;
      font-size: 0.7rem;
      color: #6b7280;
      text-align: center;
    }
    .copied-toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.4);
      display: none;
      animation: fadeIn 0.2s;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="meta-left">
      <span class="badge">Clean Note</span>
      <span class="note-title">${safeTitle}</span>
      <span class="note-stats">\u2022 ${wordCount} \u09B6\u09AC\u09CD\u09A6 \u2022 ${charCount} \u0985\u0995\u09CD\u09B7\u09B0 \u2022 ${dateFormatted}</span>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="copyContent()">\u{1F4CB} \u0995\u09AA\u09BF \u0995\u09B0\u09C1\u09A8</button>
      <a class="btn" href="/note/raw/${id}" target="_blank" title="View 100% Plain Raw Text">\u{1F4C4} Raw</a>
      <button class="btn" onclick="downloadTxt()">\u{1F4BE} .txt</button>
      <a class="btn" href="/" title="Open Full App">\u{1F3E0} \u09B9\u09CB\u09AE</a>
    </div>
  </header>

  <div class="main-wrap">
    <div class="note-box">
      <pre id="noteText">${safeContent}</pre>
    </div>
    <p class="footer-notice">Firebase Persistent Storage \u2022 Pure Preformatted Raw Note</p>
  </div>

  <div id="toast" class="copied-toast">\u2713 \u0995\u09AA\u09BF \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7!</div>

  <script>
    function copyContent() {
      const text = document.getElementById('noteText').innerText;
      navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('toast');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2200);
      });
    }
    function downloadTxt() {
      const text = document.getElementById('noteText').innerText;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '${id}.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  </script>
</body>
</html>`;
    return res.send(html);
  } catch (err) {
    console.error("Error serving clean note view:", err);
    return res.status(500).send("Error rendering note");
  }
});
async function loadFullAppBuffer(id) {
  const now = Date.now();
  const cached = appsMemoryCache.get(id);
  if (cached && cached.buffer) {
    if (cached.expiresAt > 0 && now > cached.expiresAt) {
      appsMemoryCache.delete(id);
      deleteDoc(doc(fbDb, "apps", id)).catch(() => {
      });
      return null;
    }
    return { app: cached, buffer: cached.buffer };
  }
  const diskPath = path.join(APPS_DIR, `${id}.apk`);
  let diskBuffer = null;
  try {
    if (fs.existsSync(diskPath)) {
      diskBuffer = await fsp.readFile(diskPath);
    }
  } catch {
  }
  let firestoreData = null;
  try {
    const docSnap = await getDoc(doc(fbDb, "apps", id));
    if (docSnap.exists()) {
      firestoreData = docSnap.data();
    }
  } catch (err) {
    console.warn(`[Firestore] App doc lookup warning: ${err?.message}`);
  }
  if (firestoreData) {
    if (firestoreData.expiresAt && firestoreData.expiresAt > 0 && now > firestoreData.expiresAt) {
      deleteDoc(doc(fbDb, "apps", id)).catch(() => {
      });
      if (diskBuffer) {
        fsp.unlink(diskPath).catch(() => {
        });
      }
      return null;
    }
  }
  let finalBuffer = diskBuffer;
  if (!finalBuffer && firestoreData) {
    if (firestoreData.dataUrl && firestoreData.dataUrl.startsWith("data:")) {
      const match = firestoreData.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        finalBuffer = Buffer.from(match[2], "base64");
      }
    } else if (firestoreData.hasChunks && firestoreData.chunksCount > 0) {
      try {
        const chunkPromises = [];
        for (let i = 0; i < firestoreData.chunksCount; i++) {
          chunkPromises.push(getDoc(doc(fbDb, "apps", id, "chunks", `chunk_${i}`)));
        }
        const chunkDocs = await Promise.all(chunkPromises);
        let fullBase64 = "";
        for (const cDoc of chunkDocs) {
          if (cDoc.exists()) {
            fullBase64 += cDoc.data()?.data || "";
          }
        }
        if (fullBase64.length > 0) {
          finalBuffer = Buffer.from(fullBase64, "base64");
        }
      } catch (chunkErr) {
        console.error("Error fetching Firestore chunks:", chunkErr);
      }
    }
  }
  if (!finalBuffer) {
    return null;
  }
  if (!fs.existsSync(diskPath)) {
    fsp.writeFile(diskPath, finalBuffer).catch(() => {
    });
  }
  const appItem = {
    id,
    name: firestoreData?.name || cached?.name || "app.apk",
    appName: firestoreData?.appName || cached?.appName || firestoreData?.name || "Android App",
    size: firestoreData?.size || cached?.size || finalBuffer.length,
    buffer: finalBuffer,
    type: firestoreData?.type || "application/vnd.android.package-archive",
    uploadedAt: Number(firestoreData?.uploadedAt || cached?.uploadedAt || now),
    expiresAt: Number(firestoreData?.expiresAt || cached?.expiresAt || 0),
    retention: firestoreData?.retention || cached?.retention || "permanent",
    isExpired: false,
    publicUrl: firestoreData?.publicUrl || cached?.publicUrl || `/app?id=${id}`,
    downloadUrl: firestoreData?.downloadUrl || cached?.downloadUrl || `/app/download/${id}`,
    downloadsCount: Number(firestoreData?.downloadsCount || cached?.downloadsCount || 0),
    hasChunks: false,
    chunksCount: 0
  };
  appsMemoryCache.set(id, appItem);
  pruneAppsCache();
  return { app: appItem, buffer: finalBuffer };
}
app.post("/api/apps/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No APK file received" });
    }
    const retention = req.body.retention || "permanent";
    const rawAppName = req.body.appName || "";
    const now = Date.now();
    const expiresAt = computeExpiresAt(retention, now);
    const originalName = req.file.originalname || "application.apk";
    const safeBase = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 35);
    const id = `app_${now}_${Math.random().toString(36).substring(2, 7)}_${safeBase || "apk"}`;
    const cleanAppName = rawAppName.trim() || originalName.replace(/\.[^/.]+$/, "").replace(/[_.-]/g, " ");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `localhost:${PORT}`;
    const publicUrl = `${protocol}://${host}/app?id=${id}`;
    const downloadUrl = `${protocol}://${host}/app/download/${id}`;
    const diskPath = path.join(APPS_DIR, `${id}.apk`);
    await fsp.writeFile(diskPath, req.file.buffer);
    const cachedApp = {
      id,
      name: originalName,
      appName: cleanAppName,
      size: req.file.size,
      buffer: req.file.buffer,
      type: "application/vnd.android.package-archive",
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      publicUrl,
      downloadUrl,
      downloadsCount: 0
    };
    appsMemoryCache.set(id, cachedApp);
    pruneAppsCache();
    const newApp = {
      id,
      name: originalName,
      appName: cleanAppName,
      size: req.file.size,
      type: "application/vnd.android.package-archive",
      publicUrl,
      downloadUrl,
      storagePath: `uploads/apps/${id}.apk`,
      storageProvider: "local-disk",
      uploadedAt: now,
      expiresAt: expiresAt || 0,
      retention,
      isExpired: false,
      downloadsCount: 0,
      hasChunks: false,
      chunksCount: 0
    };
    try {
      await Promise.race([
        setDoc(doc(fbDb, "apps", id), newApp),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timeout")), 6e3))
      ]);
      console.log(`[Firebase Firestore] APK App created: ${id} ("${cleanAppName}", Size: ${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);
    } catch (fbErr) {
      console.warn(`[Firebase] App metadata Firestore sync warning (saved locally & in RAM):`, fbErr?.message);
    }
    return res.json({ success: true, app: newApp });
  } catch (err) {
    console.error("Error uploading APK to Firestore:", err);
    return res.status(500).json({ error: err.message || "Failed to save APK app" });
  }
});
app.get("/api/apps", async (_req, res) => {
  try {
    const now = Date.now();
    const appsMap = /* @__PURE__ */ new Map();
    try {
      const snapshot = await getDocs(collection(fbDb, "apps"));
      for (const d of snapshot.docs) {
        const data = d.data();
        const expiresAt = data.expiresAt && data.expiresAt > 0 ? Number(data.expiresAt) : null;
        if (expiresAt && now > expiresAt) {
          deleteDoc(doc(fbDb, "apps", d.id)).catch(() => {
          });
          const diskPath = path.join(APPS_DIR, `${d.id}.apk`);
          fsp.unlink(diskPath).catch(() => {
          });
          continue;
        }
        appsMap.set(data.id || d.id, {
          id: data.id || d.id,
          name: data.name || "app.apk",
          appName: data.appName || data.name || "Android App",
          size: Number(data.size || 0),
          type: data.type || "application/vnd.android.package-archive",
          uploadedAt: Number(data.uploadedAt || now),
          expiresAt,
          retention: data.retention || (expiresAt ? "1day" : "permanent"),
          isExpired: false,
          publicUrl: data.publicUrl,
          downloadUrl: data.downloadUrl,
          downloadsCount: Number(data.downloadsCount || 0),
          hasChunks: Boolean(data.hasChunks),
          chunksCount: data.chunksCount || 0
        });
      }
    } catch (fbErr) {
      console.warn("[Firestore] Error fetching apps collection:", fbErr?.message);
    }
    for (const [id, cached] of appsMemoryCache.entries()) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) continue;
      if (!appsMap.has(id)) {
        appsMap.set(id, {
          id: cached.id,
          name: cached.name,
          appName: cached.appName,
          size: cached.size,
          type: cached.type,
          uploadedAt: cached.uploadedAt,
          expiresAt: cached.expiresAt || null,
          retention: cached.retention,
          isExpired: false,
          publicUrl: cached.publicUrl,
          downloadUrl: cached.downloadUrl,
          downloadsCount: cached.downloadsCount || 0,
          hasChunks: false,
          chunksCount: 0
        });
      }
    }
    const appsList = Array.from(appsMap.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
    return res.json(appsList);
  } catch (err) {
    console.error("Error fetching apps:", err);
    return res.json([]);
  }
});
app.get("/api/apps/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const now = Date.now();
    const cached = appsMemoryCache.get(id);
    if (cached) {
      if (cached.expiresAt > 0 && now > cached.expiresAt) {
        appsMemoryCache.delete(id);
        return res.status(404).json({ error: "App expired" });
      }
      return res.json({ success: true, app: cached });
    }
    const docSnap = await getDoc(doc(fbDb, "apps", id));
    if (!docSnap.exists()) {
      return res.status(404).json({ error: "App not found" });
    }
    const data = docSnap.data();
    if (data.expiresAt && data.expiresAt > 0 && now > data.expiresAt) {
      deleteDoc(doc(fbDb, "apps", id)).catch(() => {
      });
      return res.status(404).json({ error: "App expired" });
    }
    return res.json({ success: true, app: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch app" });
  }
});
app.delete("/api/apps/:id", async (req, res) => {
  try {
    const { id } = req.params;
    appsMemoryCache.delete(id);
    const diskPath = path.join(APPS_DIR, `${id}.apk`);
    fsp.unlink(diskPath).catch(() => {
    });
    withTimeout(deleteDoc(doc(fbDb, "apps", id)), 2500, null).catch(() => {
    });
    console.log(`[Firebase Firestore] Deleted APK app: ${id}`);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete app" });
  }
});
app.all(["/app/download/:id", "/api/apps/:id/download"], async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  try {
    const { id } = req.params;
    const diskPath = path.join(APPS_DIR, `${id}.apk`);
    if (fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      let appName = "app.apk";
      const cached = appsMemoryCache.get(id);
      if (cached?.name) {
        appName = cached.name;
      }
      const downloadFileName2 = appName.endsWith(".apk") ? appName : `${appName}.apk`;
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadFileName2)}"`);
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (req.method === "HEAD") {
        return res.end();
      }
      if (cached) cached.downloadsCount = (cached.downloadsCount || 0) + 1;
      setDoc(doc(fbDb, "apps", id), { downloadsCount: cached?.downloadsCount || 1 }, { merge: true }).catch(() => {
      });
      const stream = fs.createReadStream(diskPath);
      return stream.pipe(res);
    }
    const appData = await loadFullAppBuffer(id);
    if (!appData) {
      return res.status(404).send("APK file not found or expired");
    }
    const { app: app2, buffer } = appData;
    app2.downloadsCount = (app2.downloadsCount || 0) + 1;
    setDoc(doc(fbDb, "apps", id), { downloadsCount: app2.downloadsCount }, { merge: true }).catch(() => {
    });
    const downloadFileName = app2.name.endsWith(".apk") ? app2.name : `${app2.name}.apk`;
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (req.method === "HEAD") {
      return res.end();
    }
    return res.end(buffer);
  } catch (err) {
    console.error("Error streaming APK download:", err);
    return res.status(500).send(`Error downloading APK: ${err.message}`);
  }
});
app.get(["/app", "/app/:id"], async (req, res, next) => {
  try {
    const id = (req.params.id || req.query.id || "").trim();
    if (!id) {
      return next();
    }
    if (req.query.download === "1" || req.query.direct === "1") {
      return res.redirect(`/app/download/${id}`);
    }
    const appData = await loadFullAppBuffer(id);
    if (!appData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="bn">
        <head><meta charset="utf-8"><title>App Not Found</title></head>
        <body style="background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;margin:0;">
          <div style="text-align:center;padding:1.5rem;">
            <div style="font-size:3rem;margin-bottom:0.5rem;">\u{1F4F1}</div>
            <h1 style="color:#f43f5e;margin-bottom:0.5rem;">404 - \u0985\u09CD\u09AF\u09BE\u09AA \u09AB\u09BE\u0987\u09B2 \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF</h1>
            <p style="color:#94a3b8;margin-bottom:1.5rem;">\u098F\u0987 \u098F\u09AA\u09BF\u0995\u09C7 (APK) \u09AB\u09BE\u0987\u09B2\u099F\u09BF \u09AE\u09C1\u099B\u09C7 \u09AB\u09C7\u09B2\u09BE \u09B9\u09DF\u09C7\u099B\u09C7 \u0985\u09A5\u09AC\u09BE \u09AE\u09C7\u09DF\u09BE\u09A6\u09C7\u09B0 \u09B8\u09AE\u09DF \u09AA\u09BE\u09B0 \u09B9\u09DF\u09C7 \u0997\u09C7\u099B\u09C7\u0964</p>
            <a href="/" style="color:#10b981;text-decoration:none;font-weight:bold;">\u2190 \u09B9\u09CB\u09AE\u09AA\u09C7\u099C\u09C7 \u09AB\u09BF\u09B0\u09C7 \u09AF\u09BE\u09A8</a>
          </div>
        </body>
        </html>
      `);
    }
    const { app: app2 } = appData;
    const safeAppName = escapeHtml(app2.appName || app2.name || "Android Application");
    const safeFileName = escapeHtml(app2.name || "application.apk");
    const sizeMb = (app2.size / (1024 * 1024)).toFixed(2);
    const dateFormatted = new Date(app2.uploadedAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
    const directDownloadUrl = app2.downloadUrl || `/app/download/${app2.id}`;
    const retentionText = app2.retention === "permanent" ? "\u267E\uFE0F \u09B8\u09CD\u09A5\u09BE\u09DF\u09C0 (Permanent)" : `\u23F3 \u09AE\u09C7\u09DF\u09BE\u09A6: ${app2.retention}`;
    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeAppName} - APK \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1 \u0993 \u0987\u09A8\u09B8\u09CD\u099F\u09B2</title>
  <meta name="description" content="Download and install ${safeAppName} Android APK directly to your phone." />
  <meta property="og:title" content="${safeAppName} - Android APK Download" />
  <meta property="og:description" content="\u09AB\u09BE\u0987\u09B2 \u09B8\u09BE\u0987\u099C: ${sizeMb} MB \u2022 \u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1 \u0995\u09B0\u09C7 \u0986\u09AA\u09A8\u09BE\u09B0 \u09AB\u09CB\u09A8\u09C7 \u0987\u09A8\u09B8\u09CD\u099F\u09B2 \u0995\u09B0\u09C1\u09A8\u0964" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem 1rem;
      background-image: radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.12) 0%, rgba(3, 7, 18, 0) 70%);
    }
    .card {
      background: #0b1120;
      border: 1px solid #1f293d;
      border-radius: 1.5rem;
      max-width: 480px;
      width: 100%;
      padding: 2rem 1.75rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 30px -10px rgba(16, 185, 129, 0.2);
      text-align: center;
    }
    .app-icon {
      width: 76px;
      height: 76px;
      margin: 0 auto 1.25rem auto;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
    }
    .app-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 0.35rem;
      line-height: 1.3;
    }
    .app-sub {
      font-size: 0.8rem;
      color: #94a3b8;
      font-family: monospace;
      word-break: break-all;
      margin-bottom: 1.25rem;
    }
    .meta-pills {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.75rem;
    }
    .pill {
      background: #111827;
      border: 1px solid #1f2937;
      color: #cbd5e1;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
    }
    .pill-green {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .btn-download {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      width: 100%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #022c22;
      font-size: 1.05rem;
      font-weight: 800;
      padding: 0.95rem 1.5rem;
      border-radius: 1rem;
      text-decoration: none;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.5);
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
    }
    .btn-download:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 30px -5px rgba(16, 185, 129, 0.6);
      background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
      margin-top: 0.85rem;
    }
    .btn-secondary {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.65rem 0.85rem;
      border-radius: 0.75rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-secondary:hover {
      background: #334155;
      color: #ffffff;
    }
    .guide-box {
      margin-top: 1.75rem;
      background: #060a12;
      border: 1px solid #1e293b;
      border-radius: 1rem;
      padding: 1.1rem;
      text-align: left;
    }
    .guide-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .guide-steps {
      font-size: 0.72rem;
      color: #94a3b8;
      line-height: 1.6;
      padding-left: 1.1rem;
    }
    .guide-steps li {
      margin-bottom: 0.35rem;
    }
    .footer-brand {
      margin-top: 1.5rem;
      font-size: 0.72rem;
      color: #64748b;
    }
    .footer-brand a {
      color: #10b981;
      text-decoration: none;
      font-weight: 600;
    }
    .toast {
      position: fixed;
      bottom: 1.5rem;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.5rem 1.25rem;
      border-radius: 9999px;
      box-shadow: 0 10px 20px -5px rgba(0,0,0,0.5);
      display: none;
      animation: fadeIn 0.2s;
      z-index: 99;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="app-icon">\u{1F916}</div>
    <h1 class="app-title">${safeAppName}</h1>
    <p class="app-sub">${safeFileName}</p>

    <div class="meta-pills">
      <span class="pill pill-green">\u{1F4E6} ${sizeMb} MB</span>
      <span class="pill">${retentionText}</span>
      <span class="pill">\u2B07\uFE0F ${app2.downloadsCount || 0} \u09AC\u09BE\u09B0 \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1</span>
      <span class="pill">\u{1F4C5} ${dateFormatted}</span>
    </div>

    <!-- Direct Download & Install Button -->
    <a href="${directDownloadUrl}" class="btn-download" download="${safeFileName}">
      <span>\u{1F4F2} \u0985\u09CD\u09AF\u09BE\u09AA \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1 \u0993 \u0987\u09A8\u09B8\u09CD\u099F\u09B2 \u0995\u09B0\u09C1\u09A8</span>
    </a>

    <div class="actions-grid">
      <button class="btn-secondary" onclick="copyDirectLink()">
        \u{1F517} \u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u09B2\u09BF\u0982\u0995 \u0995\u09AA\u09BF
      </button>
      <button class="btn-secondary" onclick="copyPageLink()">
        \u{1F4E4} \u09B6\u09C7\u09DF\u09BE\u09B0 \u09AA\u09C7\u099C \u0995\u09AA\u09BF
      </button>
    </div>

    <!-- Android Quick Installation Guide -->
    <div class="guide-box">
      <div class="guide-title">
        <span>\u{1F4A1} \u09AB\u09CB\u09A8\u09C7 \u0987\u09A8\u09B8\u09CD\u099F\u09B2 \u0995\u09B0\u09BE\u09B0 \u09B8\u09B9\u099C \u09A8\u09BF\u09DF\u09AE:</span>
      </div>
      <ol class="guide-steps">
        <li>\u0989\u09AA\u09B0\u09C7\u09B0 <strong>'\u0985\u09CD\u09AF\u09BE\u09AA \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1 \u0993 \u0987\u09A8\u09B8\u09CD\u099F\u09B2 \u0995\u09B0\u09C1\u09A8'</strong> \u09AC\u09BE\u099F\u09A8\u09C7 \u099A\u09BE\u09AA \u09A6\u09BF\u09A8\u0964</li>
        <li>\u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1 \u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 \u09B9\u09B2\u09C7 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09AC\u09BE\u09B0 \u0985\u09A5\u09AC\u09BE \u09AB\u09CB\u09A8\u09C7\u09B0 <strong>Downloads</strong> \u09AB\u09CB\u09B2\u09CD\u09A1\u09BE\u09B0 \u09A5\u09C7\u0995\u09C7 <code>.apk</code> \u09AB\u09BE\u0987\u09B2\u099F\u09BF\u09A4\u09C7 \u099F\u09CD\u09AF\u09BE\u09AA \u0995\u09B0\u09C1\u09A8\u0964</li>
        <li>\u09AF\u09A6\u09BF \u09A8\u09BF\u09B0\u09BE\u09AA\u09A4\u09CD\u09A4\u09BE \u09B8\u09A4\u09B0\u09CD\u0995\u09A4\u09BE \u09A6\u09C7\u0996\u09BE\u09DF, \u09A4\u09AC\u09C7 <strong>'Settings'</strong> \u098F \u0997\u09BF\u09DF\u09C7 <strong>'Allow from this source'</strong> \u099A\u09BE\u09B2\u09C1 \u0995\u09B0\u09C7 <strong>'Install'</strong> \u099A\u09BE\u09AA\u09C1\u09A8\u0964</li>
      </ol>
    </div>

    <div class="footer-brand">
      Firebase App Vault \u2022 <a href="/">\u{1F3E0} \u09B9\u09CB\u09AE \u0985\u09CD\u09AF\u09BE\u09AA\u09C7 \u09AB\u09BF\u09B0\u09C7 \u09AF\u09BE\u09A8</a>
    </div>
  </div>

  <div id="toast" class="toast">\u2713 \u09B2\u09BF\u0982\u0995 \u0995\u09AA\u09BF \u0995\u09B0\u09BE \u09B9\u09DF\u09C7\u099B\u09C7!</div>

  <script>
    function showToast(text) {
      const toast = document.getElementById('toast');
      toast.innerText = text;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }
    function copyDirectLink() {
      const rawUrl = '${directDownloadUrl}';
      const url = rawUrl.startsWith('http') ? rawUrl : (window.location.origin + rawUrl);
      navigator.clipboard.writeText(url).then(() => {
        showToast('\u2713 \u09B8\u09B0\u09BE\u09B8\u09B0\u09BF \u09A1\u09BE\u0989\u09A8\u09B2\u09CB\u09A1\u09C7\u09B0 APK \u09B2\u09BF\u0982\u0995 \u0995\u09AA\u09BF \u09B9\u09DF\u09C7\u099B\u09C7!');
      });
    }
    function copyPageLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('\u2713 \u0987\u09A8\u09B8\u09CD\u099F\u09B2\u09BE\u09B0 \u09AA\u09C7\u099C\u09C7\u09B0 \u09B2\u09BF\u0982\u0995 \u0995\u09AA\u09BF \u09B9\u09DF\u09C7\u099B\u09C7!');
      });
    }
  </script>
</body>
</html>`;
    return res.send(html);
  } catch (err) {
    console.error("Error serving app installer view:", err);
    return res.status(500).send("Error rendering app view");
  }
});
async function bootstrap() {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} Firebase AI Vault Server running at http://0.0.0.0:${PORT}`);
  });
}
bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
});
