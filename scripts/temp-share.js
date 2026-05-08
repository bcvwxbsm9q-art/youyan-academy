/**
 * 快速分享脚本 - 启动服务器并创建临时公网链接
 */

const { spawn } = require('child_process');
const path = require('path');
const https = require('https');
const http = require('http');

const PORT = 3003;

console.log('========================================');
console.log('   🚀 游雁学院 - 快速分享启动中...');
console.log('========================================\n');

// 检查服务器是否运行
function checkServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${PORT}`, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// 启动服务器
async function startServer() {
    console.log('📦 启动本地服务器...');
    
    const server = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..'),
        detached: true,
        stdio: 'ignore'
    });
    
    server.unref();
    
    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ 服务器已启动\n');
}

// 使用 localtunnel
async function createTunnel() {
    console.log('🌐 正在创建公网链接...');
    console.log('   (可能需要几秒钟)\n');
    
    const localtunnel = require('localtunnel');
    
    try {
        const tunnel = await localtunnel({ 
            port: PORT,
            subdomain: 'youyan-academy'
        });
        
        console.log('========================================');
        console.log('   ✅ 分享链接创建成功！');
        console.log('========================================\n');
        
        console.log('🔗 你的公网访问地址:');
        console.log(`   ${tunnel.url}\n`);
        
        console.log('📋 分享说明:');
        console.log('   1. 点击上面的链接即可访问');
        console.log('   2. 首次访问需要输入密码（防爬虫）');
        console.log('   3. 访问密码: youyan2026');
        console.log('   4. 链接有效期与本程序运行时间相同\n');
        
        console.log('📱 社交平台分享:');
        console.log('   微信: 可直接分享链接');
        console.log('   朋友圈: 可直接分享链接\n');
        
        return tunnel;
        
    } catch (error) {
        console.error('❌ 创建链接失败:', error.message);
        return null;
    }
}

// 主函数
async function main() {
    try {
        // 检查服务器
        const serverRunning = await checkServer();
        
        if (!serverRunning) {
            console.log('服务器未运行，正在启动...\n');
            await startServer();
        } else {
            console.log('✅ 服务器已在运行\n');
        }
        
        // 创建隧道
        const tunnel = await createTunnel();
        
        if (!tunnel) {
            console.log('\n❌ 无法创建分享链接');
            console.log('\n请手动运行以下命令:\n');
            console.log('   1. 启动服务器: node server.js');
            console.log('   2. 另开终端运行: lt --port 3003\n');
        }
        
    } catch (error) {
        console.error('错误:', error.message);
    }
}

main();
