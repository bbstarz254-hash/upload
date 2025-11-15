// ---------------------------------------------------
// upload-server.cjs (Cloudinary version – PUBLIC uploads)
// ---------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

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
    <p><strong>POST</strong> files to: <code>/upload</code></p>
    <p>Files stored on Cloudinary (public delivery)</p>
  `);
});

// ---------- TEMP STORAGE (multer still saves temp file) ----------
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uid = req.headers['x-user-id'] || 'anon';
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${uid}${ext}`);
  },
});

// Simple, conservative MIME whitelist
const ALLOWED_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const ok = ALLOWED_MIME.includes(file.mimetype);
    cb(null, ok);
  },
});

// ---------- UPLOAD ENDPOINT (PUBLIC URL) ----------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // Upload to Cloudinary as public (type: 'upload' is the public default)
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto', // detects images, videos, raw (pdf/docx) automatically
      folder: 'yourapp_uploads',
      type: 'upload', // explicit: public delivery
    });

    // Return useful metadata to client
    res.json({
      url: result.secure_url, // public HTTPS URL (CDN)
      public_id: result.public_id, // Cloudinary public_id (folder + name)
      resource_type: result.resource_type,
      original_filename: req.file.originalname,
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    // Always try to remove the temp file if it exists
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (e) {
      console.warn('Failed to remove temp file:', e);
    }
  }
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));
