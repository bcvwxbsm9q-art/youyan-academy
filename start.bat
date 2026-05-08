@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   游雁学院 - 线上学习平台
echo   1200px 固定宽度版本
echo ========================================
echo.
echo 正在启动服务器...
echo.
echo 访问地址:
echo   首页：http://localhost:3000/
echo   课程中心：http://localhost:3000/course.html
echo   讲师风采：http://localhost:3000/teacher.html
echo   个人中心：http://localhost:3000/center.html
echo   宽度测试：http://localhost:3000/test-width.html
echo.
echo 按 Ctrl+C 停止服务器
echo.
node server.js
pause
