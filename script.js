

    // ===== 离线许可校验配置 =====
    // 有效许可码的 HMAC-SHA256 哈希值列表（不包含明文 code）
    const VALID_LICENSE_HASHES = [
        '1c6799ef7f135b08f0f3cd351a237478dc3dda3d9dbec166e284b2e7bbf428f0',
        '422278f8af53658afc292591c1e7d158d032d3c316e0f37e48aaf6b562eb0245'
    ];
    const MASTER_SECRET = 'tsx123!'; // 和生成 hash 的密钥保持一致

    // ===== 工具函数：计算 HMAC-SHA256 =====
    async function computeHmacSHA256(message, key) {
        const enc = new TextEncoder();
        const keyBuf = await crypto.subtle.importKey(
            'raw', enc.encode(key),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', keyBuf, enc.encode(message));
        return Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const LICENSE_MAX_SECONDS = 6 * 3600; // 6 小时（秒）
    let validated = false;
    let startTime = null;

    // 当前累计使用时长
    async function getUsedTime() {
        return await GM.getValue('license_used_seconds', 0);
    }
    async function setUsedTime(sec) {
        return await GM.setValue('license_used_seconds', sec);
    }

    const locked = await GM.getValue('license_locked');
    let usedSeconds = await getUsedTime();

    // 锁定或超时
    if (locked || usedSeconds >= LICENSE_MAX_SECONDS) {
        alert('❌ 许可已过期，达到 6 小时限制。');
        await GM.setValue('license_locked', true);
        return;
    }

    const storedCode = await GM.getValue('license_code');
    const storedTime = await GM.getValue('license_time');

    if (storedCode && storedTime) {
        const hash = await computeHmacSHA256(storedCode, MASTER_SECRET);
        if (VALID_LICENSE_HASHES.includes(hash)) {
            validated = true;
        }
    }

    // 提示用户输入
    for (let i = 0; !validated && i < 10; i++) {
        const code = prompt('请输入脚本使用许可码:');
        if (!code) {
            alert('未输入许可码，脚本终止。');
            return;
        }

        const hash = await computeHmacSHA256(code, MASTER_SECRET);
        if (VALID_LICENSE_HASHES.includes(hash)) {
            await GM.setValue('license_code', code);
            await GM.setValue('license_time', Date.now());
            validated = true;
            break;
        } else {
            alert(`❌ 第 ${i + 1} 次尝试失败，许可码无效，请重新输入。`);
            await GM.setValue('license_code', null);
            await GM.setValue('license_time', null);
        }

        if (i === 9) {
            await GM.setValue('license_locked', true);
            alert('❌ 连续 10 次失败，许可已锁定。');
            return;
        }
    }

    if (!validated) {
        alert('❌ 验证失败，脚本终止。');
        return;
    }

    startTime = Math.floor(Date.now() / 1000);
    const hoursUsed = (usedSeconds / 3600).toFixed(2);
    const hoursLeft = ((LICENSE_MAX_SECONDS - usedSeconds) / 3600).toFixed(2);
    console.log(`✅ 离线许可校验通过，累计使用 ${hoursUsed} 小时，剩余 ${hoursLeft} 小时。`);

    const CONFIG = {
        PROMPT_SELECTOR: '.prompt.scroll-display-none',
        COVER_SELECTOR: 'div[data-index="0"] .cover.finished',
        DOWNLOAD_BTN_SELECTOR: 'img.btn-icon.el-tooltip__trigger[src*="toolbar_download_ic"]',
        DOWNLOAD_TIMEOUT: 60000,
        POST_DOWNLOAD_WAIT: 3000
    };

    let state = {
        isProcessing: false,
        isDownloading: false,
        promptText: null,
        firstRun: true
    };

    const delay = ms => new Promise(r => setTimeout(r, ms));
    const randomDelay = () => delay(500 + Math.random() * 1000);

    function createFloatingBtn() {
        const btn = document.createElement('div');
        btn.style.cssText = `
            position: fixed;
            right: 30px;
            bottom: 30px;
            width: 60px;
            height: 60px;
            background: #007bff;
            border-radius: 50%;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            transition: all 0.3s;
        `;
        btn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
        return btn;
    }

    async function handlePrompt() {
        const ta = await waitForElement(CONFIG.PROMPT_SELECTOR);
        if (!state.promptText) {
            if (ta.value.trim()) {
                state.promptText = ta.value;
            } else {
                state.promptText = prompt('请输入视频描述（后续自动复用）：');
                if (!state.promptText) throw new Error('必须输入提示词');
            }
        }
        if (ta.value !== state.promptText) {
            ta.value = state.promptText;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(500);
        }
    }

    async function triggerSendButton() {
        const btn = document.querySelector('.btn-group svg.icon');
        if (!btn) throw new Error('发送按钮未找到');
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        console.log('✅ 点击发送');
        await randomDelay();
    }

    async function downloadVideo() {
        if (state.isDownloading) {
            console.log('⚠️ 已在下载中，跳过重复下载');
            return;
        }
        state.isDownloading = true;
        try {
            console.log('🔍 开始查找下载按钮', CONFIG.DOWNLOAD_BTN_SELECTOR);
            const dlBtn = await waitForElement(CONFIG.DOWNLOAD_BTN_SELECTOR, CONFIG.DOWNLOAD_TIMEOUT);
            console.log('✅ 找到下载按钮，模拟点击');
            await simulateHumanClick(dlBtn);

            // 等待浏览器开始下载
            console.log(`⏳ 等待 ${CONFIG.POST_DOWNLOAD_WAIT/1000}s 确保下载启动`);
            await delay(CONFIG.POST_DOWNLOAD_WAIT);
            console.log('✅ 下载触发完毕');
        } catch (err) {
            console.error('❌ 下载失败:', err);
            GM_notification({ title: '下载失败', text: err.message, timeout: 3000 });
        } finally {
            state.isDownloading = false;
        }
    }

    async function processSingleFile(file) {
        try {
            console.log(`\n▶️ 开始处理 ${file.name}`);
            const input = document.querySelector('input[type="file"][accept*="image"]');
            input.value = '';
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await delay(800);

            await handlePrompt();

            const confirmBtn = await waitForElement('.btn_done:not([disabled])');
            confirmBtn.click();
            console.log('✅ 确认上传图片');
            await delay(800);

            await triggerSendButton();
            if (!state.firstRun) {
            let retries = 0;
            // 如果首次运行不等待，后续进入重试逻辑
            while (retries < 5) {
                // 等待生成
                await delay(7000);
                if (document.querySelector(CONFIG.COVER_SELECTOR)) {
                    console.log(`⚠️ 第 ${retries + 1} 次检测到歇一歇，暂停 10分钟后重试上传`);
                    await delay(600000);
                    console.log('🔄 重试点击发送按钮');
                    await triggerSendButton();
                    retries++;
                } else {
                    console.log('✅ 未检测到歇一歇，继续后续流程');
                    break;
                }
            }
            if (retries === 5) {
                console.warn('⚠️ 已达到最大重试次数 5 次，跳过重试');
            }
        }
            state.firstRun = false;

            await waitForCover(CONFIG.COVER_SELECTOR);
            console.log('✅ 封面已生成');

            await downloadVideo();

            console.log(`✅ ${file.name} 处理完成`);
        } catch (err) {
            console.error(`❌ 处理失败 (${file.name}):`, err);
            GM_notification({ title: '处理失败', text: file.name, timeout: 3000 });
        }
    }

    function waitForCover(selector, timeout = 1200000) {
        return new Promise((resolve, reject) => {
            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`等待封面超时: ${selector}`));
            }, timeout);
        });
    }

    async function simulateHumanClick(el) {
        return new Promise(resolve => {
            const events = ['mouseover','mousedown','mouseup','click'];
            events.forEach((type, i) =>
                setTimeout(() => {
                    el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
                    if (i === events.length - 1) resolve();
                }, i * (80 + Math.random() * 120))
            );
        });
    }

    function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            (function check() {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start > timeout) return reject(new Error(`未找到元素: ${selector}`));
                setTimeout(check, 500);
            })();
        });
    }

    async function processFiles(files) {
        if (state.isProcessing) return;
        state.isProcessing = true;
        window.onbeforeunload = () => '文件正在处理中…';

        for (let f of files) {
            await processSingleFile(f);
        }

        state.isProcessing = false;
        window.onbeforeunload = null;
        GM_notification({ title: '处理完成', text: `共 ${files.length} 个文件已完成`, timeout: 5000 });
    }

    (function init() {
        const fab = createFloatingBtn();
        fab.addEventListener('click', () => {
            if (state.isProcessing) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.accept = 'image/*';
            input.onchange = async e => {
                const files = Array.from(e.target.files);
                if (!files.length) return;
                fab.style.background = '#a72835';
                try {
                    await processFiles(files);
                } finally {
                    fab.style.background = '#007bff';
                    input.remove();
                }
            };
            input.click();
        });
        document.body.appendChild(fab);
    })();
    window.addEventListener('beforeunload', async () => {
    if (!startTime) return;
    const endTime = Math.floor(Date.now() / 1000);
    const delta = endTime - startTime;

    let used = await getUsedTime();
    used += delta;
    await setUsedTime(used);

    if (used >= LICENSE_MAX_SECONDS) {
        await GM.setValue('license_locked', true);
        alert('⏰ 总使用时长已满 6 小时，许可已锁定。');
    } else {
        const hrsUsed = (used / 3600).toFixed(2);
        const hrsLeft = ((LICENSE_MAX_SECONDS - used) / 3600).toFixed(2);
        console.log(`📊 本次运行 ${Math.round(delta/60)} 分钟，总使用 ${hrsUsed} 小时，剩余 ${hrsLeft} 小时。`);
    }
});

