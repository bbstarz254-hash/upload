// ---------------------------------------------------
// upload-server.cjs (Cloudinary images + Bunny Stream video)
// ---------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// ---------- CONFIGURE BUNNY STREAM ----------
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY || '';

// ---------- HOME PAGE ----------
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Server + Cloudinary + Bunny Stream 🚀</h1>
    <p><strong>POST</strong> images to: <code>/upload</code></p>
    <p><strong>POST</strong> to <code>/bunny/create</code> to authorize a video (TUS) upload</p>
    <p><strong>POST</strong> to <code>/bunny/delete</code> to remove a Bunny video</p>
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
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — images/docs/audio only, video no longer goes through this route
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.includes(file.mimetype)),
});

// ---------- UPLOAD ENDPOINT (PUBLIC URL) — images / docs / audio ----------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // Detect type automatically for images, docs, audio
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

// ---------- DELETE ENDPOINT (Cloudinary — images/docs/audio) ----------
app.delete('/delete', async (req, res) => {
  const { public_id, resource_type = 'image' } = req.body;

  if (!public_id) {
    return res.status(400).json({ error: 'public_id is required' });
  }

  try {
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type, // 'image', 'video', 'raw' — must match what was used on upload
      invalidate: true, // Optional but recommended: removes CDN cache faster
      type: 'upload', // Usually correct for your setup
    });

    if (result.result === 'ok') {
      res.json({ message: 'File deleted successfully', result });
    } else {
      res
        .status(404)
        .json({ error: 'File not found or already deleted', result });
    }
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

// ---------- BUNNY STREAM: CREATE VIDEO + SIGNED TUS AUTH ----------
app.post('/bunny/create', async (req, res) => {
  if (!BUNNY_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Bunny Stream is not configured on the server' });
  }

  try {
    const { title } = req.body || {};

    const createRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`,
      {
        method: 'POST',
        headers: {
          AccessKey: BUNNY_STREAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: title || 'Untitled video' }),
      },
    );

    const data = await createRes.json();
    if (!createRes.ok || !data.guid) {
      console.error('Bunny create failed:', data);
      return res
        .status(500)
        .json({ error: 'Failed to create Bunny video', data });
    }

    const videoId = data.guid;
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const signature = crypto
      .createHash('sha256')
      .update(BUNNY_LIBRARY_ID + BUNNY_STREAM_API_KEY + expiration + videoId)
      .digest('hex');

    res.json({
      videoId,
      libraryId: BUNNY_LIBRARY_ID,
      expiration,
      signature,
    });
  } catch (err) {
    console.error('Bunny create error:', err);
    res.status(500).json({ error: 'Bunny create failed' });
  }
});
app.post('/bunny/resume', async (req, res) => {
  if (!BUNNY_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Bunny Stream is not configured on the server' });
  }
  try {
    const { videoId } = req.body || {};
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const expiration = Math.floor(Date.now() / 1000) + 3600;
    const signature = crypto
      .createHash('sha256')
      .update(BUNNY_LIBRARY_ID + BUNNY_STREAM_API_KEY + expiration + videoId)
      .digest('hex');

    res.json({
      videoId,
      libraryId: BUNNY_LIBRARY_ID,
      expiration,
      signature,
    });
  } catch (err) {
    console.error('Bunny resume error:', err);
    res.status(500).json({ error: 'Bunny resume failed' });
  }
});
// ---------- BUNNY STREAM: DELETE VIDEO ----------
app.post('/bunny/delete', async (req, res) => {
  if (!BUNNY_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Bunny Stream is not configured on the server' });
  }

  try {
    const { videoId } = req.body || {};
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const delRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      {
        method: 'DELETE',
        headers: { AccessKey: BUNNY_STREAM_API_KEY },
      },
    );

    if (!delRes.ok) {
      const text = await delRes.text();
      console.error('Bunny delete failed:', text);
      return res.status(500).json({ error: 'Bunny delete failed', text });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Bunny delete error:', err);
    res.status(500).json({ error: 'Bunny delete failed' });
  }
});

// ---------- BUNNY STREAM: VIDEO STATUS (optional — poll encoding progress) ----------
app.get('/bunny/status/:videoId', async (req, res) => {
  if (!BUNNY_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return res
      .status(500)
      .json({ error: 'Bunny Stream is not configured on the server' });
  }

  try {
    const { videoId } = req.params;
    const statusRes = await fetch(
      `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
      { headers: { AccessKey: BUNNY_STREAM_API_KEY } },
    );
    const data = await statusRes.json();
    if (!statusRes.ok) {
      return res.status(500).json({ error: 'Bunny status failed', data });
    }
    res.json(data);
  } catch (err) {
    console.error('Bunny status error:', err);
    res.status(500).json({ error: 'Bunny status failed' });
  }
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));
