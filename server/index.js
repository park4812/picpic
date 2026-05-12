const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const db = require('./db');

const app = express();
const server = http.createServer(app);

const isDev = process.env.NODE_ENV !== 'production';

const io = new Server(server, {
  cors: isDev ? { origin: 'http://localhost:5173', methods: ['GET', 'POST'] } : undefined,
});

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${nanoid()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use('/uploads', express.static(uploadsDir));

if (!isDev) {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
}

// --- API Routes ---

app.post('/api/posts', (req, res) => {
  const { title } = req.body;
  const id = nanoid(10);
  db.prepare('INSERT INTO posts (id, title) VALUES (?, ?)').run(id, title || 'Untitled');
  res.json({ id, title: title || 'Untitled' });
});

app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const images = db.prepare('SELECT * FROM images WHERE post_id = ? ORDER BY created_at').all(req.params.id);
  const selections = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(req.params.id);

  res.json({ ...post, images, selections });
});

app.post('/api/posts/:id/images', upload.array('images', 30), (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const insertImage = db.prepare('INSERT INTO images (id, post_id, filename, original_name) VALUES (?, ?, ?, ?)');
  const newImages = [];

  const insertMany = db.transaction((files) => {
    for (const file of files) {
      const imageId = nanoid(10);
      insertImage.run(imageId, req.params.id, file.filename, file.originalname);
      newImages.push({
        id: imageId,
        post_id: req.params.id,
        filename: file.filename,
        original_name: file.originalname,
      });
    }
  });

  insertMany(req.files);

  io.to(req.params.id).emit('images-added', newImages);
  res.json(newImages);
});

app.delete('/api/posts/:id/images/:imageId', (req, res) => {
  const { id, imageId } = req.params;
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND post_id = ?').get(imageId, id);
  if (!image) return res.status(404).json({ error: 'Image not found' });

  db.prepare('DELETE FROM selections WHERE image_id = ? AND post_id = ?').run(imageId, id);

  const remaining = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(id);
  const reorder = db.prepare('UPDATE selections SET position = ? WHERE id = ?');
  const reorderAll = db.transaction(() => {
    remaining.forEach((s, i) => reorder.run(i, s.id));
  });
  reorderAll();

  db.prepare('DELETE FROM images WHERE id = ?').run(imageId);

  const filePath = path.join(uploadsDir, image.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  io.to(id).emit('image-deleted', { imageId });
  res.json({ success: true });
});

// --- Socket.IO ---

io.on('connection', (socket) => {
  socket.on('join-post', (postId) => {
    socket.join(postId);
    const onlineCount = io.sockets.adapter.rooms.get(postId)?.size || 0;
    io.to(postId).emit('online-count', onlineCount);
  });

  socket.on('select-image', ({ postId, imageId, position }) => {
    const existing = db.prepare('SELECT * FROM selections WHERE post_id = ? AND image_id = ?').get(postId, imageId);
    if (existing) return;

    const maxPos = db.prepare('SELECT MAX(position) as max FROM selections WHERE post_id = ?').get(postId);
    const insertPos = position !== undefined ? position : (maxPos.max ?? -1) + 1;

    if (position !== undefined) {
      db.prepare('UPDATE selections SET position = position + 1 WHERE post_id = ? AND position >= ?').run(postId, insertPos);
    }

    db.prepare('INSERT INTO selections (post_id, image_id, position) VALUES (?, ?, ?)').run(postId, imageId, insertPos);

    const selections = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(postId);
    io.to(postId).emit('selections-updated', selections);
  });

  socket.on('deselect-image', ({ postId, imageId }) => {
    db.prepare('DELETE FROM selections WHERE post_id = ? AND image_id = ?').run(postId, imageId);

    const remaining = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(postId);
    const reorder = db.prepare('UPDATE selections SET position = ? WHERE id = ?');
    db.transaction(() => {
      remaining.forEach((s, i) => reorder.run(i, s.id));
    })();

    const selections = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(postId);
    io.to(postId).emit('selections-updated', selections);
  });

  socket.on('reorder-selection', ({ postId, imageId, newPosition }) => {
    const current = db.prepare('SELECT * FROM selections WHERE post_id = ? AND image_id = ?').get(postId, imageId);
    if (!current) return;

    const oldPos = current.position;
    if (oldPos === newPosition) return;

    db.transaction(() => {
      if (newPosition > oldPos) {
        db.prepare('UPDATE selections SET position = position - 1 WHERE post_id = ? AND position > ? AND position <= ?')
          .run(postId, oldPos, newPosition);
      } else {
        db.prepare('UPDATE selections SET position = position + 1 WHERE post_id = ? AND position >= ? AND position < ?')
          .run(postId, newPosition, oldPos);
      }
      db.prepare('UPDATE selections SET position = ? WHERE id = ?').run(newPosition, current.id);
    })();

    const selections = db.prepare('SELECT * FROM selections WHERE post_id = ? ORDER BY position').all(postId);
    io.to(postId).emit('selections-updated', selections);
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        const remaining = (io.sockets.adapter.rooms.get(room)?.size || 1) - 1;
        io.to(room).emit('online-count', remaining);
      }
    }
  });
});

if (!isDev) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
