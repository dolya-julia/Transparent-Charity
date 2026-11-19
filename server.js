const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Создаём папки и файл базы, если их ещё нет
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');

// Раздаём загруженные файлы как статику по URL http://localhost:3001/uploads/...
app.use('/uploads', express.static(UPLOADS_DIR));

// Настройка безопасного сохранения файлов с уникальными префиксами
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const prefix = file.fieldname === 'photo' ? 'photo' : (file.fieldname === 'milestoneDoc' ? 'ms' : 'doc');
        cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Ограничение на размер файла: 10 МБ
    fileFilter: (req, file, cb) => {
        // Базовая проверка типов (изображения и основные типы документов)
        const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            return cb(null, true);
        }
        cb(new Error('Ошибка: разрешена загрузка только изображений и документов (PDF, DOC, TXT)!'));
    }
});

// Вспомогательные функции чтения/записи JSON
function readDB() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function writeDB(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 1. Получить метаданные заявки (включая отчёты по этапам) по её ID
app.get('/api/requests/:id', (req, res) => {
    const db = readDB();
    const record = db[req.params.id] || {
        photoUrl: '',
        shelterName: 'Приют-партнёр',
        fullStory: '',
        docUrl: '',
        milestones: {}
    };
    res.json(record);
});

// 2. Сохранить фото и основной документ для заявки
app.post('/api/requests/:id', upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'document', maxCount: 1 }
]), (req, res) => {
    const db = readDB();
    const id = req.params.id;
    const existing = db[id] || { milestones: {} };

    const photoFile = req.files?.photo?.[0];
    const docFile = req.files?.document?.[0];

    db[id] = {
        ...existing,
        shelterName: req.body.shelterName || existing.shelterName || 'Приют-партнёр',
        fullStory: req.body.fullStory || existing.fullStory || '',
        photoUrl: photoFile ? `http://localhost:${PORT}/uploads/${photoFile.filename}` : (existing.photoUrl || ''),
        docUrl: docFile ? `http://localhost:${PORT}/uploads/${docFile.filename}` : (existing.docUrl || '')
    };

    writeDB(db);
    res.json({ success: true, data: db[id] });
});

// 3. НОВЫЙ МАРШРУТ: Сохранить отчёт (документ/чек) для конкретного этапа лечения (milestone)
app.post('/api/requests/:id/milestones/:milestoneId', upload.single('milestoneDoc'), (req, res) => {
    try {
        const db = readDB();
        const { id, milestoneId } = req.params;
        
        if (!db[id]) {
            db[id] = { photoUrl: '', shelterName: 'Приют-партнёр', fullStory: '', docUrl: '', milestones: {} };
        }
        if (!db[id].milestones) {
            db[id].milestones = {};
        }

        const msFile = req.file;
        if (!msFile) {
            return res.status(400).json({ success: false, error: 'Файл отчёта не передан' });
        }

        const fileUrl = `http://localhost:${PORT}/uploads/${msFile.filename}`;

        // Сохраняем ссылку строго привязанной к номеру этапа
        db[id].milestones[milestoneId] = {
            docUrl: fileUrl,
            uploadedAt: new Date().toISOString()
        };

        writeDB(db);
        res.json({ success: true, docUrl: fileUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`RescueDAO Backend запущен: http://localhost:${PORT}`);
});