const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const app = express();

// --- 0. Multer 上传配置 ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/') 
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 1. 连接数据库 ---
mongoose.connect('mongodb+srv://1946261830_db_user:zxcvbnmasdfghjkl@cluster0.h82wjgm.mongodb.net/?appName=Cluster0')
    .then(() => console.log('MongoDB 连接成功'))
    .catch(err => console.error('MongoDB 连接失败', err));

// --- 2. 定义模型 ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    contact: String,
    bio: String,
    avatar: String,
    borrowedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }] // 收藏列表
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

// --- 3. 中间件 ---
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: 'my_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

// --- 4. API 路由 ---

// [用户] 获取当前用户信息
app.get('/api/me', async (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    
    // populate wishlist 才能在前端获取收藏详情
    const user = await User.findById(req.session.userId)
        .populate({ path: 'borrowedBooks', populate: { path: 'owner', select: 'username contact' } })
        .populate('wishlist'); 

    const myBooks = await Book.find({ owner: req.session.userId }).populate('borrower', 'username contact');
    res.json({ loggedIn: true, user, myBooks });
});

// [收藏] 切换收藏状态 (修复版：解决ID匹配问题)
app.post('/api/books/:id/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    
    try {
        const user = await User.findById(req.session.userId);
        const bookId = req.params.id;

        // 核心修复：使用 findIndex 并将 ObjectId 转为字符串比较
        const index = user.wishlist.findIndex(id => id.toString() === bookId);
        
        let isWishlisted = false;

        if (index === -1) {
            // 没找到 -> 添加
            user.wishlist.push(bookId);
            isWishlisted = true;
        } else {
            // 找到了 -> 移除
            user.wishlist.splice(index, 1);
            isWishlisted = false;
        }

        await user.save();
        res.json({ success: true, isWishlisted });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: '操作失败' });
    }
});

// [用户] 更新资料
app.post('/api/me/update', upload.single('avatar'), async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    try {
        const { username, contact, bio } = req.body;
        const user = await User.findById(req.session.userId);
        if (username !== user.username) {
            const exists = await User.findOne({ username });
            if (exists) return res.json({ success: false, message: '用户名已存在' });
            user.username = username;
        }
        user.contact = contact;
        user.bio = bio;
        if (req.file) user.avatar = '/uploads/' + req.file.filename;
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// [用户] 注册
app.post('/api/register', async (req, res) => {
    const { username, password, contact, bio } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hash, contact, bio });
        await user.save();
        req.session.userId = user._id;
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

// [书籍] 获取列表
app.get('/api/books', async (req, res) => {
    const { search } = req.query;
    const query = search ? { title: { $regex: search, $options: 'i' } } : {};
    const books = await Book.find(query).populate('owner', 'username');
    res.json(books);
});

// [书籍] 详情
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

// [书籍] 发布
app.post('/api/books', upload.single('coverImage'), async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    let imageUrl = '';
    if (req.file) imageUrl = '/uploads/' + req.file.filename;
    const book = new Book({
        title: req.body.title,
        author: req.body.author,
        description: req.body.description,
        image: imageUrl,
        owner: req.session.userId
    });
    await book.save();
    res.json({ success: true, id: book._id });
});

// [书籍] 删除
app.delete('/api/books/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    try {
        const book = await Book.findById(req.params.id);
        if (!book) return res.json({ success: false, message: '书籍不存在' });
        if (book.owner.toString() !== req.session.userId) return res.json({ success: false, message: '无权操作' });
        if (book.status !== 'available') return res.json({ success: false, message: '书籍当前无法删除' });
        await Book.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: '错误' });
    }
});

// [核心] 借还流程
app.post('/api/books/:id/action', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    const { action } = req.body;
    const book = await Book.findById(req.params.id);
    const user = await User.findById(req.session.userId);

    if (!book) return res.json({ success: false, message: '书籍不存在' });

    if (action === 'borrow') {
        if (book.status !== 'available') return res.json({ success: false, message: '已被借走' });
        if (user.borrowedBooks.length >= 3) return res.json({ success: false, message: '最多借3本书' });
        book.status = 'borrowed';
        book.borrower = user._id;
        user.borrowedBooks.push(book._id);
        await user.save();
    }
    else if (action === 'return_request') {
        if (String(book.borrower) !== String(user._id)) return res.json({ success: false });
        book.status = 'returning';
    }
    else if (action === 'confirm_return') {
        if (String(book.owner) !== String(user._id)) return res.json({ success: false });
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