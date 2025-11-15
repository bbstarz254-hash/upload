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

// ---------- CONFIGURE CLOUDINARY ----------
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
    <p>Files stored on Cloudinary with public delivery</p>
  `);
});

// ---------- TEMP STORAGE ----------
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
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.includes(file.mimetype)),
});

// ---------- UPLOAD ENDPOINT (PUBLIC URL) ----------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // Detect type automatically for images, videos, docs
    let resourceType = 'auto';
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
    ];
    if (docTypes.includes(req.file.mimetype)) resourceType = 'raw';

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: resourceType,
      folder: 'yourapp_uploads',
      type: 'upload', // public delivery
      access_mode: 'public', // 🔑 ensure raw/docs are public
    });

    res.json({
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      original_filename: req.file.originalname,
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    // Clean up temp file
    try {
      if (req.file?.path && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
    } catch (e) {
      console.warn('Failed to remove temp file:', e);
    }
  }
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));
