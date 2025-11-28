// public/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();     // 初始化导航栏
    initTheme();      // 初始化深色模式
});

// 1. 动态生成导航栏
async function initNavbar() {
    const navContainer = document.getElementById('navbar-placeholder');
    if (!navContainer) return;

    // 先渲染骨架
    navContainer.innerHTML = `
        <nav class="navbar navbar-expand-lg bg-body-tertiary mb-4 shadow-sm">
            <div class="container">
                <a class="navbar-brand fw-bold" href="index.html">📚 BookLink</a>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav me-auto align-items-center">
                        <li class="nav-item"><a class="nav-link" href="index.html">首页</a></li>
                        <li class="nav-item"><a class="nav-link" href="about.html">关于</a></li>
                    </ul>
                    
                    <!-- [修改] 增加 d-flex, align-items-center 和 gap-3 (拉开间距) -->
                    <div class="d-flex align-items-center gap-3 mt-3 mt-lg-0" id="nav-auth-area">
                        <!-- JS 动态填充这里 -->
                        <span class="spinner-border spinner-border-sm text-secondary"></span>
                    </div>
                </div>
            </div>
        </nav>
    `;

    // 检查登录状态
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        const authArea = document.getElementById('nav-auth-area');
        
        // [修改] 模式切换按钮：变成稍微大一点的圆形
        let html = `
            <button class="btn btn-light rounded-circle shadow-sm d-flex align-items-center justify-content-center" 
                    onclick="toggleTheme()" 
                    style="width: 42px; height: 42px; border: 1px solid #dee2e6;"
                    title="切换模式">
                🌓
            </button>
        `;
        
        if (data.loggedIn) {
            // [修改] 登录后：按钮变大 (px-4 py-2)，加图标，圆角胶囊
            html += `
                <a href="new-book.html" class="btn btn-primary shadow-sm fw-bold px-4 py-2" style="border-radius: 50px;">
                    ✨ 发布书籍
                </a>
                
                <a href="profile.html" class="btn btn-outline-primary fw-bold px-4 py-2" style="border-radius: 50px;">
                     ${data.user.username}
                </a>
                
                <button onclick="logout()" class="btn btn-link text-muted text-decoration-none fw-bold" style="font-size: 0.95rem;">
                    退出
                </button>
            `;
        } else {
            // [修改] 未登录：按钮变大
            html += `<a href="login.html" class="btn btn-primary fw-bold px-4 py-2 shadow-sm" style="border-radius: 50px;">登录 / 注册</a>`;
        }
        authArea.innerHTML = html;
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

// 2. 退出登录
async function logout() {
    await fetch('/api/logout');
    window.location.href = 'index.html';
}

// 3. 深色模式
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', next);
    localStorage.setItem('theme', next);
}

// 4. 获取 URL 参数 helper
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}