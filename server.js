const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');     // 新增: 处理文件路径
const multer = require('multer'); // 新增: 处理上传图片
const app = express();

// --- 0. Multer 上传配置 (新增部分) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 图片保存到 public/uploads 文件夹
        cb(null, 'public/uploads/') 
    },
    filename: function (req, file, cb) {
        // 给图片起个唯一的名字 (时间戳 + 随机数 + 原始后缀)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// --- 1. 连接MongoDB数据库 ---
// 注意：你之前提供的连接字符串已包含密码，请妥善保管。
mongoose.connect('mongodb+srv://1946261830_db_user:zxcvbnmasdfghjkl@cluster0.h82wjgm.mongodb.net/?appName=Cluster0')
    .then(() => console.log('MongoDB 连接成功'))
    .catch(err => console.error('MongoDB 连接失败', err));

// --- 2. 定义模型 ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    contact: String,
    bio: String,
    borrowedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }]
}));

const Book = mongoose.model('Book', new mongoose.Schema({
    title: { type: String, required: true },
    author: String,
    image: String,
    description: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['available', 'borrowed', 'returning'], default: 'available' },
    comments: [{ user: String, text: String, date: { type: Date, default: Date.now } }]
}));

// --- 3. 中间件配置 ---
app.use(express.static('public')); // 托管静态文件 (HTML/JS/CSS/Uploads)
app.use(express.json()); // 解析 JSON 请求体
app.use(session({
    secret: 'my_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 } // 1天
}));

// --- 4. API 路由 (只返回 JSON) ---

// [用户] 获取当前用户信息
app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const user = await User.findById(req.session.userId)
        .populate({ path: 'borrowedBooks', populate: { path: 'owner', select: 'username contact' } });
    const myBooks = await Book.find({ owner: req.session.userId }).populate('borrower', 'username contact');
    res.json({ loggedIn: true, user, myBooks });
});

// [用户] 注册
app.post('/api/register', async (req, res) => {
    const { username, password, contact, bio } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hash, contact, bio });
        await user.save();
        req.session.userId = user._id; // 注册后自动登录
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: '用户名已存在' });
    }
});

// [用户] 登录
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        res.json({ success: true });
    } else {
        res.json({ success: false, message: '账号或密码错误' });
    }
});

// [用户] 退出
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// [书籍] 获取列表 (支持搜索)
app.get('/api/books', async (req, res) => {
    const { search } = req.query;
    const query = search ? { title: { $regex: search, $options: 'i' } } : {};
    const books = await Book.find(query).populate('owner', 'username');
    res.json(books);
});

// [书籍] 获取单本详情
app.get('/api/books/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id)
            .populate('owner', 'username contact')
            .populate('borrower', 'username contact');
        res.json(book);
    } catch (e) {
        res.status(404).json(null);
    }
});

// --- [重点修改] 发布新书 (支持文件上传) ---
// upload.single('coverImage') 会自动处理名为 coverImage 的文件
app.post('/api/books', upload.single('coverImage'), async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    
    // 如果用户上传了图，req.file 就会有内容
    let imageUrl = ''; // 默认为空或使用前端占位图
    if (req.file) {
        // 生成访问路径： /uploads/文件名
        imageUrl = '/uploads/' + req.file.filename;
    }

    const book = new Book({
        title: req.body.title,
        author: req.body.author,
        description: req.body.description,
        image: imageUrl, // 存入数据库的是相对路径
        owner: req.session.userId
    });
    
    await book.save();
    res.json({ success: true, id: book._id });
});

// [核心] 借书/还书流程控制
app.post('/api/books/:id/action', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    const { action } = req.body;
    const book = await Book.findById(req.params.id);
    const user = await User.findById(req.session.userId);

    if (!book) return res.json({ success: false, message: '书籍不存在' });

    // 1. 借书
    if (action === 'borrow') {
        if (book.status !== 'available') return res.json({ success: false, message: '已被借走' });
        if (user.borrowedBooks.length >= 3) return res.json({ success: false, message: '最多借3本书' });
        
        book.status = 'borrowed';
        book.borrower = user._id;
        user.borrowedBooks.push(book._id);
        await user.save();
    }
    // 2. 借书者申请还书
    else if (action === 'return_request') {
        if (String(book.borrower) !== String(user._id)) return res.json({ success: false });
        book.status = 'returning';
    }
    // 3. 书主确认归还
    else if (action === 'confirm_return') {
        if (String(book.owner) !== String(user._id)) return res.json({ success: false });
        
        // 从借阅者列表中移除
        const borrower = await User.findById(book.borrower);
        if (borrower) {
            borrower.borrowedBooks.pull(book._id);
            await borrower.save();
        }
        book.status = 'available';
        book.borrower = null;
    }

    await book.save();
    res.json({ success: true });
});

// [留言]
app.post('/api/books/:id/comment', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    const user = await User.findById(req.session.userId);
    const book = await Book.findById(req.params.id);
    book.comments.push({ user: user.username, text: req.body.text });
    await book.save();
    res.json({ success: true });
});

app.listen(3000, () => console.log('服务已启动: http://localhost:3000'));