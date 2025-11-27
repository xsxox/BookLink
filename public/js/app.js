// 通用配置和工具函数

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();     // 初始化导航栏
    initTheme();      // 初始化深色模式
});

// 1. 动态生成导航栏 (不需要每个HTML都写一遍复杂的逻辑)
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
                    <ul class="navbar-nav me-auto">
                        <li class="nav-item"><a class="nav-link" href="index.html">首页</a></li>
                        <li class="nav-item"><a class="nav-link" href="about.html">关于</a></li>
                    </ul>
                    <div class="d-flex align-items-center" id="nav-auth-area">
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
        
        let html = `<button class="btn btn-sm btn-outline-secondary me-3" onclick="toggleTheme()">🌓</button>`;
        
        if (data.loggedIn) {
            html += `
                <a href="new-book.html" class="btn btn-primary btn-sm me-2">发布书籍</a>
                <a href="profile.html" class="btn btn-outline-primary btn-sm me-2">${data.user.username}</a>
                <a href="#" onclick="logout()" class="btn btn-link nav-link">退出</a>
            `;
        } else {
            html += `<a href="login.html" class="btn btn-outline-primary btn-sm">登录 / 注册</a>`;
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