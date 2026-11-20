
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// =========================================================
// НАСТРОЙКИ
// =========================================================

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({
            drafts: {},
            requests: {}
        }, null, 2),
        'utf8'
    );
}

app.use('/uploads', express.static(UPLOADS_DIR));

// =========================================================
// БАЗА ДАННЫХ
// =========================================================

/*
Новая структура data.json:

{
    "drafts": {
        "draft-id": {
            "id": "draft-id",
            "status": "draft",
            "chainRequestId": null,
            "shelterName": "...",
            "animalName": "...",
            "fullStory": "...",
            "requestedAmount": "...",
            "photoUrl": "...",
            "docUrl": "...",
            "milestones": {},
            "createdAt": "...",
            "updatedAt": "..."
        }
    },

    "requests": {
        "1": {
            "chainRequestId": "1",
            "draftId": "...",
            "photoUrl": "...",
            "docUrl": "...",
            "milestones": {}
        }
    }
}
*/

function createEmptyDB() {
    return {
        drafts: {},
        requests: {}
    };
}

function readDB() {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // Если файл уже имеет новую структуру
    if (
        raw &&
        typeof raw === 'object' &&
        raw.drafts &&
        raw.requests
    ) {
        return raw;
    }

    /*
    Миграция старого формата.

    Раньше data.json содержал записи непосредственно
    по ID блокчейн-заявки:

    {
        "1": {
            "photoUrl": "...",
            "docUrl": "...",
            "milestones": {}
        }
    }

    Переносим их в requests, чтобы не потерять данные.
    */

    const db = createEmptyDB();

    if (raw && typeof raw === 'object') {
        for (const [id, record] of Object.entries(raw)) {
            if (!record || typeof record !== 'object') {
                continue;
            }

            db.requests[id] = {
                chainRequestId: id,
                draftId: null,
                photoUrl: record.photoUrl || '',
                shelterName: record.shelterName || 'Приют-партнёр',
                animalName: record.animalName || '',
                fullStory: record.fullStory || '',
                docUrl: record.docUrl || '',
                milestones: record.milestones || {},
                updatedAt: new Date().toISOString()
            };
        }
    }

    writeDB(db);

    return db;
}

function writeDB(db) {
    const tempFile = `${DATA_FILE}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(db, null, 2),
        'utf8'
    );

    fs.renameSync(tempFile, DATA_FILE);
}

// =========================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =========================================================

function createId() {
    return crypto.randomUUID();
}

function getFileUrl(filename) {
    return `http://localhost:${PORT}/uploads/${filename}`;
}

function isValidRequestId(id) {
    return /^\d+$/.test(String(id)) && Number(id) > 0;
}

function parseMilestones(value, fallback = {}) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        const parsed = JSON.parse(value);

        if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed)
        ) {
            throw new Error();
        }

        return parsed;
    } catch {
        throw new Error('Некорректный формат milestones');
    }
}

function ensureDraftEditable(draft) {
    if (!draft) {
        return {
            success: false,
            status: 404,
            error: 'Черновик не найден'
        };
    }

    if (
        draft.status !== 'draft' &&
        draft.status !== 'changes_requested'
    ) {
        return {
            success: false,
            status: 409,
            error: 'Редактирование этого черновика сейчас недоступно'
        };
    }

    return {
        success: true
    };
}

function getExistingRequest(id) {
    const db = readDB();

    return db.requests[String(id)] || {
        chainRequestId: String(id),
        draftId: null,
        photoUrl: '',
        shelterName: 'Приют-партнёр',
        animalName: '',
        fullStory: '',
        docUrl: '',
        milestones: {}
    };
}

function applyUploadedFiles(record, files = {}) {
    const photoFile = files.photo?.[0];
    const docFile = files.document?.[0];

    if (photoFile) {
        record.photoUrl = getFileUrl(photoFile.filename);
    }

    if (docFile) {
        record.docUrl = getFileUrl(docFile.filename);
    }

    return record;
}

// =========================================================
// ЗАГРУЗКА ФАЙЛОВ
// =========================================================

const allowedExtensions = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.pdf',
    '.doc',
    '.docx',
    '.txt'
]);

const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/octet-stream'
]);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        let prefix = 'doc';

        if (file.fieldname === 'photo') {
            prefix = 'photo';
        } else if (file.fieldname === 'milestoneDoc') {
            prefix = 'ms';
        }

        const uniquePart = crypto.randomBytes(8).toString('hex');

        cb(
            null,
            `${prefix}-${Date.now()}-${uniquePart}${ext}`
        );
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 5
    },

    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.has(ext)) {
            return cb(
                new Error(
                    'Разрешены только JPG, PNG, PDF, DOC, DOCX и TXT'
                )
            );
        }

        if (
            file.mimetype &&
            !allowedMimeTypes.has(file.mimetype)
        ) {
            return cb(
                new Error('Недопустимый тип загружаемого файла')
            );
        }

        cb(null, true);
    }
});

// =========================================================
// 1. РАБОТА С ЧЕРНОВИКАМИ
// =========================================================

/*
GET /api/drafts

Получить список всех черновиков.
*/

app.get('/api/drafts', (req, res) => {
    try {
        const db = readDB();

        const drafts = Object.values(db.drafts);

        res.json({
            success: true,
            drafts
        });
    } catch (err) {
        console.error('Ошибка получения черновиков:', err);

        res.status(500).json({
            success: false,
            error: 'Не удалось получить черновики'
        });
    }
});

/*
POST /api/drafts

Создать новый черновик.

Поддерживаемые поля:
- shelterName
- animalName
- fullStory
- requestedAmount
- milestones (JSON)
- photo (файл)
- document (файл)

Никакая транзакция в блокчейне здесь не выполняется.
*/

app.post(
    '/api/drafts',
    upload.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'document', maxCount: 1 }
    ]),
    (req, res) => {
        try {
            const db = readDB();

            const draftId = createId();
            const now = new Date().toISOString();

            const draft = {
                id: draftId,

                // Черновик ещё не отправлен в блокчейн
                status: 'draft',

                chainRequestId: null,
                transactionHash: null,

                shelterName: req.body.shelterName || 'Приют-партнёр',
                animalName: req.body.animalName || '',
                fullStory: req.body.fullStory || '',
                requestedAmount: req.body.requestedAmount || '',

                photoUrl: '',
                docUrl: '',

                milestones: parseMilestones(
                    req.body.milestones,
                    {}
                ),

                createdAt: now,
                updatedAt: now
            };

            applyUploadedFiles(draft, req.files);

            db.drafts[draftId] = draft;

            writeDB(db);

            res.status(201).json({
                success: true,
                message: 'Черновик создан',
                draft
            });
        } catch (err) {
            console.error('Ошибка создания черновика:', err);

            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    }
);

/*
GET /api/drafts/:draftId

Получить конкретный черновик.
*/

app.get('/api/drafts/:draftId', (req, res) => {
    try {
        const db = readDB();
        const draft = db.drafts[req.params.draftId];

        if (!draft) {
            return res.status(404).json({
                success: false,
                error: 'Черновик не найден'
            });
        }

        res.json({
            success: true,
            draft
        });
    } catch (err) {
        console.error('Ошибка получения черновика:', err);

        res.status(500).json({
            success: false,
            error: 'Не удалось получить черновик'
        });
    }
});

/*
PUT /api/drafts/:draftId

Изменить существующий черновик.

Можно менять:
- описание;
- название приюта;
- имя животного;
- сумму;
- предварительные этапы;
- фотографию;
- основной документ.

Редактирование доступно для:
- draft;
- changes_requested.

После публикации заявки этапы в блокчейне уже зафиксированы.
*/

app.put(
    '/api/drafts/:draftId',
    upload.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'document', maxCount: 1 }
    ]),
    (req, res) => {
        try {
            const db = readDB();
            const draft = db.drafts[req.params.draftId];

            const access = ensureDraftEditable(draft);

            if (!access.success) {
                return res.status(access.status).json({
                    success: false,
                    error: access.error
                });
            }

            if (req.body.shelterName !== undefined) {
                draft.shelterName = req.body.shelterName;
            }

            if (req.body.animalName !== undefined) {
                draft.animalName = req.body.animalName;
            }

            if (req.body.fullStory !== undefined) {
                draft.fullStory = req.body.fullStory;
            }

            if (req.body.requestedAmount !== undefined) {
                draft.requestedAmount = req.body.requestedAmount;
            }

            if (req.body.milestones !== undefined) {
                draft.milestones = parseMilestones(
                    req.body.milestones,
                    draft.milestones || {}
                );
            }

            applyUploadedFiles(draft, req.files);

            draft.updatedAt = new Date().toISOString();

            writeDB(db);

            res.json({
                success: true,
                message: 'Черновик обновлён',
                draft
            });
        } catch (err) {
            console.error('Ошибка обновления черновика:', err);

            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    }
);

/*
DELETE /api/drafts/:draftId

Удалить черновик, который ещё не связан с блокчейн-заявкой.
*/

app.delete('/api/drafts/:draftId', (req, res) => {
    try {
        const db = readDB();
        const draft = db.drafts[req.params.draftId];

        if (!draft) {
            return res.status(404).json({
                success: false,
                error: 'Черновик не найден'
            });
        }

        if (draft.chainRequestId) {
            return res.status(409).json({
                success: false,
                error: 'Нельзя удалить черновик, уже связанный с блокчейн-заявкой'
            });
        }

        delete db.drafts[req.params.draftId];

        writeDB(db);

        res.json({
            success: true,
            message: 'Черновик удалён'
        });
    } catch (err) {
        console.error('Ошибка удаления черновика:', err);

        res.status(500).json({
            success: false,
            error: 'Не удалось удалить черновик'
        });
    }
});

// =========================================================
// 2. ОТЧЁТЫ ПО ЭТАПАМ ЧЕРНОВИКА
// =========================================================

/*
POST /api/drafts/:draftId/milestones/:milestoneId

Загрузить документ для предварительного этапа черновика.
*/

app.post(
    '/api/drafts/:draftId/milestones/:milestoneId',
    upload.single('milestoneDoc'),
    (req, res) => {
        try {
            const db = readDB();
            const { draftId, milestoneId } = req.params;

            const draft = db.drafts[draftId];

            const access = ensureDraftEditable(draft);

            if (!access.success) {
                return res.status(access.status).json({
                    success: false,
                    error: access.error
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Файл документа не передан'
                });
            }

            if (!draft.milestoneDocuments) {
                draft.milestoneDocuments = {};
            }

            const fileUrl = getFileUrl(req.file.filename);

            draft.milestoneDocuments[milestoneId] = {
                docUrl: fileUrl,
                uploadedAt: new Date().toISOString()
            };

            draft.updatedAt = new Date().toISOString();

            writeDB(db);

            res.json({
                success: true,
                docUrl: fileUrl
            });
        } catch (err) {
            console.error('Ошибка загрузки документа этапа:', err);

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

// =========================================================
// 3. СВЯЗЬ ЧЕРНОВИКА С БЛОКЧЕЙН-ЗАЯВКОЙ
// =========================================================

/*
POST /api/drafts/:draftId/link

Вызывается ПОСЛЕ успешного выполнения createAidRequest()
в блокчейне.

Тело JSON:

{
    "requestId": "1",
    "transactionHash": "0x..."
}

Важно:
Этот маршрут не создаёт заявку в блокчейне.
Он только сохраняет связь между уже созданной заявкой
и её черновиком.

requestId должен быть получен из результата транзакции
или события AidRequestCreated.
*/

app.post('/api/drafts/:draftId/link', (req, res) => {
    try {
        const db = readDB();

        const { draftId } = req.params;
        const { requestId, transactionHash } = req.body;

        const draft = db.drafts[draftId];

        if (!draft) {
            return res.status(404).json({
                success: false,
                error: 'Черновик не найден'
            });
        }

        if (!isValidRequestId(requestId)) {
            return res.status(400).json({
                success: false,
                error: 'Некорректный requestId'
            });
        }

        if (
            draft.chainRequestId &&
            String(draft.chainRequestId) !== String(requestId)
        ) {
            return res.status(409).json({
                success: false,
                error: 'Черновик уже связан с другой блокчейн-заявкой'
            });
        }

        const existingRequest = db.requests[String(requestId)];

        if (
            existingRequest &&
            existingRequest.draftId &&
            existingRequest.draftId !== draftId
        ) {
            return res.status(409).json({
                success: false,
                error: 'Эта блокчейн-заявка уже связана с другим черновиком'
            });
        }

        draft.chainRequestId = String(requestId);
        draft.transactionHash = transactionHash || null;
        draft.status = 'submitted';
        draft.updatedAt = new Date().toISOString();

        db.requests[String(requestId)] = {
            chainRequestId: String(requestId),
            draftId,

            shelterName: draft.shelterName || 'Приют-партнёр',
            animalName: draft.animalName || '',
            fullStory: draft.fullStory || '',
            requestedAmount: draft.requestedAmount || '',

            photoUrl: draft.photoUrl || '',
            docUrl: draft.docUrl || '',

            milestones: draft.milestones || {},
            milestoneDocuments: draft.milestoneDocuments || {},

            transactionHash: transactionHash || null,
            updatedAt: new Date().toISOString()
        };

        writeDB(db);

        res.json({
            success: true,
            message: 'Черновик связан с блокчейн-заявкой',
            requestId: String(requestId),
            draft
        });
    } catch (err) {
        console.error('Ошибка связывания черновика:', err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// =========================================================
// 4. МЕТАДАННЫЕ БЛОКЧЕЙН-ЗАЯВОК
// =========================================================

/*
GET /api/requests/:id

Получить метаданные по ID заявки из RescueDAO.
*/

app.get('/api/requests/:id', (req, res) => {
    try {
        const id = req.params.id;

        if (!isValidRequestId(id)) {
            return res.status(400).json({
                success: false,
                error: 'Некорректный ID заявки'
            });
        }

        const record = getExistingRequest(id);

        res.json({
            success: true,
            data: record
        });
    } catch (err) {
        console.error('Ошибка получения заявки:', err);

        res.status(500).json({
            success: false,
            error: 'Не удалось получить данные заявки'
        });
    }
});

/*
POST /api/requests/:id

Сохранить или обновить метаданные уже существующей
блокчейн-заявки.

Этот маршрут нужен для обновления описания и файлов,
например после возврата заявки на доработку.

Само изменение данных в блокчейне выполняется отдельно
через updateRequestDetails() и resubmitForReview().
*/

app.post(
    '/api/requests/:id',
    upload.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'document', maxCount: 1 }
    ]),
    (req, res) => {
        try {
            const id = req.params.id;

            if (!isValidRequestId(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'Некорректный ID заявки'
                });
            }

            const db = readDB();

            const existing = db.requests[id] || {
                chainRequestId: id,
                draftId: null,
                photoUrl: '',
                shelterName: 'Приют-партнёр',
                animalName: '',
                fullStory: '',
                docUrl: '',
                milestones: {}
            };

            if (req.body.shelterName !== undefined) {
                existing.shelterName = req.body.shelterName;
            }

            if (req.body.animalName !== undefined) {
                existing.animalName = req.body.animalName;
            }

            if (req.body.fullStory !== undefined) {
                existing.fullStory = req.body.fullStory;
            }

            if (req.body.requestedAmount !== undefined) {
                existing.requestedAmount = req.body.requestedAmount;
            }

            if (req.body.milestones !== undefined) {
                existing.milestones = parseMilestones(
                    req.body.milestones,
                    existing.milestones || {}
                );
            }

            applyUploadedFiles(existing, req.files);

            existing.updatedAt = new Date().toISOString();

            db.requests[id] = existing;

            // Синхронизируем метаданные с привязанным черновиком
            if (existing.draftId && db.drafts[existing.draftId]) {
                const draft = db.drafts[existing.draftId];

                draft.shelterName = existing.shelterName;
                draft.animalName = existing.animalName;
                draft.fullStory = existing.fullStory;
                draft.requestedAmount = existing.requestedAmount;
                draft.photoUrl = existing.photoUrl;
                draft.docUrl = existing.docUrl;
                draft.milestones = existing.milestones;
                draft.updatedAt = existing.updatedAt;
            }

            writeDB(db);

            res.json({
                success: true,
                data: existing
            });
        } catch (err) {
            console.error('Ошибка сохранения метаданных заявки:', err);

            res.status(400).json({
                success: false,
                error: err.message
            });
        }
    }
);

// =========================================================
// 5. ОТЧЁТЫ ПО ЭТАПАМ БЛОКЧЕЙН-ЗАЯВКИ
// =========================================================

/*
POST /api/requests/:id/milestones/:milestoneId

Загрузить отчёт, чек или документ по конкретному этапу.

Например:
POST /api/requests/1/milestones/2

Поле файла:
milestoneDoc
*/

app.post(
    '/api/requests/:id/milestones/:milestoneId',
    upload.single('milestoneDoc'),
    (req, res) => {
        try {
            const { id, milestoneId } = req.params;

            if (!isValidRequestId(id)) {
                return res.status(400).json({
                    success: false,
                    error: 'Некорректный ID заявки'
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'Файл отчёта не передан'
                });
            }

            const db = readDB();

            if (!db.requests[id]) {
                db.requests[id] = {
                    chainRequestId: id,
                    draftId: null,
                    photoUrl: '',
                    shelterName: 'Приют-партнёр',
                    animalName: '',
                    fullStory: '',
                    docUrl: '',
                    milestones: {}
                };
            }

            const record = db.requests[id];

            if (!record.milestones) {
                record.milestones = {};
            }

            const fileUrl = getFileUrl(req.file.filename);

            record.milestones[milestoneId] = {
                docUrl: fileUrl,
                uploadedAt: new Date().toISOString()
            };

            record.updatedAt = new Date().toISOString();

            writeDB(db);

            res.json({
                success: true,
                docUrl: fileUrl,
                milestoneId
            });
        } catch (err) {
            console.error('Ошибка загрузки отчёта:', err);

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

// =========================================================
// 6. ОБРАБОТКА ОШИБОК
// =========================================================

app.use((err, req, res, next) => {
    console.error('Ошибка backend:', err);

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: err.code === 'LIMIT_FILE_SIZE'
                ? 'Размер файла не должен превышать 10 МБ'
                : err.message
        });
    }

    res.status(400).json({
        success: false,
        error: err.message || 'Внутренняя ошибка сервера'
    });
});

// =========================================================
// 7. ЗАПУСК СЕРВЕРА
// =========================================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('RescueDAO Backend запущен');
    console.log(`Адрес: http://localhost:${PORT}`);
    console.log(`Загрузка файлов: http://localhost:${PORT}/uploads/`);
    console.log('========================================');
});
