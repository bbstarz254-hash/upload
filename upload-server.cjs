// ---------------------------------------------------
// upload-server.cjs  (Cloudinary version – FREE persistent storage)
// ---------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cloudinary = require('cloudinary').v2; // <-- NEW

const app = express();
app.use(cors({ origin: '*' }));

// ---------- CONFIGURE CLOUDINARY (use env vars!) ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your_cloud_name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_api_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_api_secret',
});

// ---------- HOME PAGE ----------
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Server + Cloudinary 🚀</h1>
    <p>POST files to: <code>/upload</code></p>
    <p>Files stored forever on Cloudinary (free tier)</p>
  `);
});

app.use(express.json());

// ---------- TEMP STORAGE (multer still saves temp file) ----------
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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (Cloudinary free limit)
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|docx|txt|mp4|webm|mp3|mov/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ---------- UPLOAD ENDPOINT (now uses Cloudinary) ----------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto', // auto-detect image/video/raw
      folder: 'yourapp_uploads', // optional folder
    });

    // Delete temp file
    fs.unlinkSync(req.file.path);

    // Return secure HTTPS URL
    res.json({ url: result.secure_url, name: req.file.originalname });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));
