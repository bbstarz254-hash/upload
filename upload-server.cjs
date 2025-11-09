// ---------------------------------------------------
// upload-server.cjs  (CommonJS – works with plain `node`)
// ---------------------------------------------------
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' })); // <-- tighten in production
// ---------- ADD THIS BLOCK ----------
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload Server is LIVE! 🚀</h1>
    <p>POST files to: <code>/upload</code></p>
    <p>Files served from: <code>/uploads/</code></p>
    <hr>
    <pre>curl -F "file=@photo.jpg" ${req.protocol}://${req.get(
    'host',
  )}/upload</pre>
  `);
});
// ------------------------------------
app.use(express.json());

// ---------- 1. Storage ----------
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uid = req.headers['x-user-id'] || 'anon';
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${uid}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|docx|txt|mp4|webm|mp3/;
    cb(null, allowed.test(file.mimetype));
  },
});

// ---------- 2. Serve files ----------
app.use('/uploads', express.static(uploadDir));

// ---------- 3. Upload endpoint ----------
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  // FORCE HTTPS (critical for CSP)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  const publicUrl = `https://${host}/uploads/${req.file.filename}`;

  res.json({ url: publicUrl, name: req.file.originalname });
});
// ---------- 4. Health ----------
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));
