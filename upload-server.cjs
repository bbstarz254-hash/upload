// ---------------------------------------------------
// upload-server.cjs  (Cloudinary – FREE persistent storage)
// ---------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();

// ---------- CORS: Allow localhost + production ----------
app.use(
  cors({
    origin: [
      'http://localhost:3000', // Dev
      'https://fanbox-e0056.firebaseapp.com', // Firebase Hosting
      'https://your-app.vercel.app', // ← REPLACE with your real domain
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['ContentIp', 'X-User-Id'],
    credentials: false,
  }),
);

// ---------- CLOUDINARY CONFIG (env vars only!) ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- HOME PAGE ----------
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Server + Cloudinary</h1>
    <p>POST to: <code>/upload</code></p>
    <p>Files stored <strong>forever</strong> on Cloudinary (free tier)</p>
    <p><strong>Status:</strong> <span style="color:green">OK</span></p>
  `);
});

app.use(express.json());

// ---------- TEMP STORAGE ----------
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uid = req.headers['x-user-id'] || 'anon';
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uid}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|docx|txt|mp4|webm|mp3|mov/i;
    const pass = allowed.test(file.mimetype);
    cb(null, pass);
  },
});

// ---------- UPLOAD ENDPOINT (UNSIGNED PUBLIC) ----------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto',
      folder: 'yourapp_uploads',
      upload_preset: 'public_uploads', // ← MUST BE UNSIGNED
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });

    // Clean up temp file
    fs.unlink(req.file.path, (err) => {
      if (err) console.warn('Failed to delete temp file:', err);
    });

    res.json({
      url: result.secure_url,
      name: req.file.originalname,
    });
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------- HEALTH CHECK ----------
app.get('/health', (req, res) => res.status(200).send('OK'));

// ---------- START SERVER ----------
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Upload server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
