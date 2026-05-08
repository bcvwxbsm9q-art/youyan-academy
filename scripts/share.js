/**
 * 游雁学院 - 一键分享脚本
 * 
 * 使用方法:
 * 1. 先安装 localtunnel: npm install -g localtunnel
 * 2. 运行: node scripts/share.js
 * 
 * 或使用 ngrok:
 * 1. 下载 ngrok: https://ngrok.com/download
 * 2. 注册获取 authtoken
 * 3. 运行: node scripts/share.js --ngrok
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3003;
const TUNNEL_PORT = 3004;

console.log('========================================');
console.log('   🚀 游雁学院 - 一键分享启动器');
console.log('========================================\n');

// 检查端口是否被占用
function checkPort(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        
        server.once('error', () => {
            resolve(false);
        });
        
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        
        server.listen(port);
    });
}

// 启动服务器
async function startServer() {
    console.log('📦 步骤1: 启动本地服务器...');
    
    // 检查端口
    const portAvailable = await checkPort(PORT);
    
    if (!portAvailable) {
        console.log(`⚠️  端口 ${PORT} 已被占用，假设服务器已在运行`);
        console.log(`   直接跳到创建公网链接...\n`);
        return true;
    }
    
    // 启动服务器
    const serverProcess = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true
    });
    
    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`✅ 服务器已启动: http://localhost:${PORT}\n`);
    return true;
}

// 使用 localtunnel 创建公网链接
async function startLocaltunnel() {
    console.log('🌐 步骤2: 创建公网访问链接...');
    console.log('   使用 localtunnel (免费，无需注册)\n');
    
    const lt = require('localtunnel');
    
    try {
        const tunnel = await lt({ 
            port: PORT,
            subdomain: 'youyan-academy-' + Math.random().toString(36).substr(2, 6)
        });
        
        console.log('========================================');
        console.log('   ✅ 分享链接创建成功！');
        console.log('========================================\n');
        
        console.log('🔗 公网访问地址:');
        console.log(`   ${tunnel.url}\n`);
        
        console.log('💡 分享提示:');
        console.log('   1. 点击上面的链接即可访问');
        console.log('   2. 首次访问需要输入密码（防爬虫）');
        console.log('   3. 密码是: youyan2026');
        console.log('   4. 链接有效期与本地服务器运行时间相同\n');
        
        console.log('📱 分享到社交平台:');
        console.log(`   微信: 直接发送链接即可`);
        console.log(`   朋友圈: 链接可正常打开`);
        console.log(`   微博: 链接可正常打开\n`);
        
        console.log('========================================');
        console.log('   按 Ctrl+C 停止服务器和分享');
        console.log('========================================\n');
        
        tunnel.on('close', () => {
            console.log('❌ 隧道已关闭');
            process.exit(0);
        });
        
        return tunnel;
        
    } catch (error) {
        console.error('❌ localtunnel 创建失败:', error.message);
        console.log('\n尝试备用方案...\n');
        return null;
    }
}

// 使用内网穿透备选方案
async function startAlternative() {
    console.log('🔄 尝试备选方案: serveo.net');
    
    return new Promise((resolve) => {
        const ssh = spawn('ssh', [
            '-o', 'StrictHostKeyChecking=no',
            '-R', `80:localhost:${PORT}`,
            'serveo.net'
        ], {
            stdio: ['pipe', 'pipe', 'inherit'],
            shell: true
        });
        
        let resolved = false;
        
        ssh.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            
            // 检测到 URL
            const urlMatch = output.match(/https?:\/\/[a-zA-Z0-9-]+\.serveo\.net/);
            if (urlMatch && !resolved) {
                resolved = true;
                console.log('\n========================================');
                console.log('   ✅ 分享链接创建成功！');
                console.log('========================================\n');
                resolve(ssh);
            }
        });
        
        ssh.stderr.on('data', (data) => {
            // SSH 的一些输出是正常的
        });
        
        // 超时处理
        setTimeout(() => {
            if (!resolved) {
                console.log('\n❌ serveo.net 方案也失败了');
                console.log('请尝试安装 ngrok: https://ngrok.com/download');
                ssh.kill();
                resolve(null);
            }
        }, 15000);
    });
}

// 主函数
async function main() {
    // 检查 localtunnel 是否安装
    try {
        require('localtunnel');
    } catch (e) {
        console.log('⚠️  localtunnel 未安装，正在安装...');
        const install = spawn('npm', ['install', '-g', 'localtunnel'], {
            stdio: 'inherit',
            shell: true
        });
        
        await new Promise(resolve => {
            install.on('close', resolve);
        });
        console.log('');
    }
    
    // 启动服务器
    await startServer();
    
    // 创建公网链接
    let tunnel = await startLocaltunnel();
    
    if (!tunnel) {
        tunnel = await startAlternative();
    }
    
    if (!tunnel) {
        console.log('\n❌ 所有方案都失败了');
        console.log('\n📋 手动部署指南:\n');
        console.log('1. 使用 CloudStudio 部署 (推荐):');
        console.log('   - 在 CodeBuddy 中点击 CloudStudio 集成');
        console.log('   - 一键部署到云服务器\n');
        console.log('2. 使用 ngrok:');
        console.log('   - 下载: https://ngrok.com/download');
        console.log('   - 注册获取 authtoken');
        console.log('   - 运行: ngrok http 3003\n');
    }
}

main().catch(console.error);
